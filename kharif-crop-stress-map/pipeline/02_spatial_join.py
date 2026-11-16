"""
02_spatial_join.py — Spatial Join & Feature Assembly
=====================================================================
Reads raw outputs from 01_ingest.py and produces the district-level
feature table used by 03_features.py and 04_train_model.py.

What this script does:
  1. Reads real imdlib .grd files → computes JJAS total per district per year
  2. Reads NOAA Niño3.4 and BOM DMI CSVs
  3. Reads ESA WorldCover tiles (or synthetic mask) → cropland fraction per district
  4. Reads ICRISAT crop calendar
  5. Joins everything into a single district × year panel
  6. Stores as GeoParquet + registers in DuckDB feature store

Run:
    python pipeline/02_spatial_join.py

Output:
    data/processed/district_features.parquet   ← main ML input table
    data/processed/feature_store.duckdb        ← queryable DB
    data/processed/maharashtra_districts_enriched.geojson  ← for frontend
"""

import os
import json
import logging
import warnings
import numpy as np
import pandas as pd
import geopandas as gpd
import duckdb
from pathlib import Path
from tqdm import tqdm

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

# ── logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── paths ─────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).resolve().parents[1]
RAW       = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
PROCESSED.mkdir(parents=True, exist_ok=True)

DIR_IMD        = RAW / "imd"
DIR_NOAA       = RAW / "noaa"
DIR_BOM        = RAW / "bom"
DIR_ESA        = RAW / "esa"
DIR_BOUNDARIES = RAW / "boundaries"
DIR_ICRISAT    = RAW / "icrisat"

# imdlib saves .grd files inside a 'rain' subfolder under the imd dir
# with yearwise format: data/raw/imd/rain/1990_rfp25.grd
IMD_RAIN_DIR = DIR_IMD / "rain"

# ── Maharashtra bounding box ───────────────────────────────────────────────────
MH_BBOX = dict(lon_min=72.6, lon_max=80.9, lat_min=15.6, lat_max=22.1)

# IMD full-India grid parameters (from imdlib source)
LAT_RAIN = np.linspace(6.5,  38.5, 129)   # 129 points
LON_RAIN = np.linspace(66.5, 100.0, 135)  # 135 points
MISSING  = -999.0                          # IMD missing value sentinel

YEARS = list(range(1990, 2024))


# ─────────────────────────────────────────────────────────────────────────────
# 1. READ IMD .GRD FILES → DISTRICT JJAS TOTALS
# ─────────────────────────────────────────────────────────────────────────────

def read_imd_grd_files(district_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Reads imdlib binary .grd files (yearwise format) one year at a time.
    For each year:
      - Loads the full-India daily grid
      - Clips to Maharashtra bounding box lat/lon indices
      - Selects Jun–Sep days (JJAS)
      - Sums daily rainfall → seasonal total per grid cell
      - Spatial-averages over each district polygon

    Returns: DataFrame  [year, district, jjas_mm_district]
    """
    log.info("── IMD .grd → district JJAS totals ──────────────────────────")

    # Find all .grd files
    grd_files = sorted(IMD_RAIN_DIR.glob("*.grd")) if IMD_RAIN_DIR.exists() else []

    if not grd_files:
        log.warning("  No .grd files found in %s", IMD_RAIN_DIR)
        log.warning("  Expected path: data/raw/imd/rain/<year>_rfp25.grd")
        log.warning("  Falling back to placeholder seasonal CSV")
        return _fallback_imd_from_csv(district_gdf)

    log.info("  Found %d .grd files", len(grd_files))

    # Pre-compute Maharashtra lat/lon index slices (same for every year)
    lat_mask = (LAT_RAIN >= MH_BBOX["lat_min"]) & (LAT_RAIN <= MH_BBOX["lat_max"])
    lon_mask = (LON_RAIN >= MH_BBOX["lon_min"]) & (LON_RAIN <= MH_BBOX["lon_max"])
    lat_idx  = np.where(lat_mask)[0]
    lon_idx  = np.where(lon_mask)[0]
    mh_lats  = LAT_RAIN[lat_idx]
    mh_lons  = LON_RAIN[lon_idx]

    log.info(
        "  MH grid slice: %d lat × %d lon  (%.1f–%.1f°N, %.1f–%.1f°E)",
        len(mh_lats), len(mh_lons),
        mh_lats[0], mh_lats[-1], mh_lons[0], mh_lons[-1],
    )

    records = []

    for grd_path in tqdm(grd_files, desc="IMD .grd years"):
        year = _parse_year_from_grd(grd_path)
        if year is None:
            continue

        try:
            jjas_grid = _read_single_grd(grd_path, year, lat_idx, lon_idx)
        except Exception as e:
            log.warning("  Skipping %s: %s", grd_path.name, e)
            continue

        # For each district: average JJAS total over grid cells inside it
        for _, row in district_gdf.iterrows():
            district_name = row["district"]
            geom          = row.geometry

            # Find grid cells whose centroids fall inside the district polygon
            cell_vals = []
            for i, lat in enumerate(mh_lats):
                for j, lon in enumerate(mh_lons):
                    from shapely.geometry import Point
                    pt = Point(lon, lat)
                    if geom.contains(pt):
                        val = jjas_grid[i, j]
                        if val > MISSING + 1:   # exclude missing
                            cell_vals.append(val)

            if cell_vals:
                district_jjas = float(np.mean(cell_vals))
            else:
                # District too small for 0.25° grid — use nearest cell
                c_lat = row.geometry.centroid.y
                c_lon = row.geometry.centroid.x
                i_near = np.argmin(np.abs(mh_lats - c_lat))
                j_near = np.argmin(np.abs(mh_lons - c_lon))
                district_jjas = float(jjas_grid[i_near, j_near])
                if district_jjas <= MISSING + 1:
                    district_jjas = np.nan

            records.append({
                "year":             year,
                "district":         district_name,
                "jjas_mm_district": round(district_jjas, 1),
            })

    if not records:
        log.warning("  No records produced from .grd files — using CSV fallback")
        return _fallback_imd_from_csv(district_gdf)

    df = pd.DataFrame(records)

    # Compute per-district LPA and anomaly %
    lpa = (
        df.groupby("district")["jjas_mm_district"]
        .mean()
        .rename("lpa_mm")
        .reset_index()
    )
    df = df.merge(lpa, on="district")
    df["rainfall_deficit_pct"] = (
        (df["jjas_mm_district"] - df["lpa_mm"]) / df["lpa_mm"] * 100
    ).round(2)

    # Mark drought years (below 90% of LPA = IMD "deficient" threshold)
    df["is_drought_year"] = (df["rainfall_deficit_pct"] < -10).astype(int)

    log.info(
        "  District JJAS table: %d rows  (%d districts × %d years)",
        len(df), df["district"].nunique(), df["year"].nunique(),
    )
    return df


def _parse_year_from_grd(path: Path) -> int | None:
    """Extract year from imdlib yearwise filename: 1990_rfp25.grd → 1990"""
    try:
        stem = path.stem          # e.g. '1990_rfp25' or '1990'
        year = int(stem.split("_")[0])
        return year if 1950 <= year <= 2030 else None
    except ValueError:
        return None


def _read_single_grd(path: Path, year: int, lat_idx, lon_idx) -> np.ndarray:
    """
    Read one imdlib binary .grd file and return JJAS-summed grid clipped
    to Maharashtra lat/lon indices.

    imdlib stores data as float32, shape (days_in_year, 129, 135)
    with axis order (time, lon_size, lat_size) — note the transpose
    in imdlib source: np.transpose(..., (0, 2, 1))
    Final shape after transpose: (days_in_year, lat, lon)
    """
    import array as arr
    import calendar

    days_in_year = 366 if calendar.isleap(year) else 365
    lat_size, lon_size = 129, 135
    expected_vals = days_in_year * lat_size * lon_size

    raw = arr.array("f")
    with open(path, "rb") as f:
        raw.fromfile(f, path.stat().st_size // raw.itemsize)

    data_flat = np.array(raw, dtype=np.float32)

    if len(data_flat) != expected_vals:
        raise ValueError(
            f"Size mismatch: expected {expected_vals}, got {len(data_flat)}"
        )

    # Reshape → (days, lat, lon) matching imdlib's transpose convention
    data_3d = np.transpose(
        np.reshape(data_flat, (days_in_year, lat_size, lon_size), order="C"),
        (0, 2, 1),
    )   # shape: (days_in_year, lat=129, lon=135)

    # Select JJAS days (Jun=day 152–181, Jul, Aug, Sep)
    # Use pandas for accurate day-of-year accounting (leap years)
    dates = pd.date_range(f"{year}-01-01", periods=days_in_year)
    jjas_mask = dates.month.isin([6, 7, 8, 9])
    jjas_data = data_3d[jjas_mask]   # shape: (≈122, 129, 135)

    # Replace missing values (-999, -99.9 etc.) with NaN
    jjas_data = np.where(jjas_data < -99, np.nan, jjas_data)

    # Sum over JJAS days → seasonal total  (lat, lon)
    jjas_total = np.nansum(jjas_data, axis=0)  # shape: (129, 135)

    # Clip to Maharashtra indices
    mh_grid = jjas_total[np.ix_(lat_idx, lon_idx)]  # shape: (n_lat_mh, n_lon_mh)
    return mh_grid


def _fallback_imd_from_csv(district_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Fallback when .grd files aren't found locally.
    Reads the placeholder seasonal CSV from step 01 and broadcasts
    the state-level anomaly to each district with a small random jitter
    (preserving relative inter-annual signal).
    """
    csv = DIR_IMD / "mh_seasonal_rainfall.csv"
    state_df = pd.read_csv(csv)
    log.info("  Using placeholder seasonal CSV: %d years", len(state_df))

    records = []
    rng = np.random.default_rng(42)

    for _, dist_row in district_gdf.iterrows():
        for _, yr_row in state_df.iterrows():
            # Add district-level noise: ±8% around state mean
            jitter = rng.uniform(-0.08, 0.08)
            jjas   = yr_row["jjas_total_mm"] * (1 + jitter)
            records.append({
                "year":             int(yr_row["year"]),
                "district":         dist_row["district"],
                "jjas_mm_district": round(jjas, 1),
            })

    df = pd.DataFrame(records)
    lpa = df.groupby("district")["jjas_mm_district"].mean().rename("lpa_mm").reset_index()
    df  = df.merge(lpa, on="district")
    df["rainfall_deficit_pct"] = (
        (df["jjas_mm_district"] - df["lpa_mm"]) / df["lpa_mm"] * 100
    ).round(2)
    df["is_drought_year"] = (df["rainfall_deficit_pct"] < -10).astype(int)
    return df


# ─────────────────────────────────────────────────────────────────────────────
# 2. CLIMATE INDICES  (Niño3.4 + DMI)
# ─────────────────────────────────────────────────────────────────────────────

def read_climate_indices() -> pd.DataFrame:
    """
    Reads NOAA Niño3.4 and BOM DMI CSVs.
    Returns: DataFrame [year, jjas_nino34, jjas_dmi, enso_phase, iod_phase]
    """
    log.info("── Climate indices ───────────────────────────────────────────")

    nino = pd.read_csv(DIR_NOAA / "nino34_monthly.csv")[["year", "jjas_nino34"]]
    dmi  = pd.read_csv(DIR_BOM  / "dmi_monthly.csv")[["year", "jjas_dmi"]]

    df = nino.merge(dmi, on="year", how="outer").sort_values("year")

    # Categorical phase labels (standard thresholds)
    # El Niño: Niño3.4 > +0.5°C for 5+ consecutive months → JJAS mean > 0.4
    # La Niña: Niño3.4 < -0.5°C
    def enso_phase(v):
        if pd.isna(v):  return "neutral"
        if v >  0.4:    return "el_nino"
        if v < -0.4:    return "la_nina"
        return "neutral"

    def iod_phase(v):
        if pd.isna(v):  return "neutral"
        if v >  0.2:    return "positive"
        if v < -0.2:    return "negative"
        return "neutral"

    df["enso_phase"] = df["jjas_nino34"].apply(enso_phase)
    df["iod_phase"]  = df["jjas_dmi"].apply(iod_phase)

    # Historical El Niño drought years in India for validation reference
    known_el_nino = [1987, 1991, 1992, 1997, 2002, 2004, 2009, 2014, 2015, 2023]
    df["known_el_nino"] = df["year"].isin(known_el_nino).astype(int)

    log.info(
        "  %d years  |  El Niño: %d  |  La Niña: %d  |  Neutral: %d",
        len(df),
        (df["enso_phase"] == "el_nino").sum(),
        (df["enso_phase"] == "la_nina").sum(),
        (df["enso_phase"] == "neutral").sum(),
    )
    return df


# ─────────────────────────────────────────────────────────────────────────────
# 3. ESA WORLDCOVER → CROPLAND FRACTION PER DISTRICT
# ─────────────────────────────────────────────────────────────────────────────

def compute_cropland_fraction(district_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Computes the fraction of each district's area that is cropland (class 40).

    Strategy A: Real ESA WorldCover GeoTIFF tiles (COG)
      - Merges tiles covering Maharashtra
      - Masks to class 40 (Cropland)
      - Computes pixel fraction per district using rasterio + shapes

    Strategy B: Synthetic cropland fraction CSV (fallback)
      - Already gridded at 0.25° — spatial-averages to district centroids

    Returns: DataFrame [district, cropland_fraction]
    """
    log.info("── ESA WorldCover → cropland fraction ────────────────────────")

    tif_files = sorted(DIR_ESA.glob("*.tif"))

    if tif_files:
        log.info("  Found %d GeoTIFF tile(s) — using real ESA data", len(tif_files))
        return _cropland_from_tif(district_gdf, tif_files)
    else:
        log.info("  No GeoTIFF tiles found — using synthetic cropland mask")
        return _cropland_from_synthetic(district_gdf)


def _cropland_from_tif(
    district_gdf: gpd.GeoDataFrame,
    tif_files: list
) -> pd.DataFrame:
    """
    Reads ESA WorldCover tiles, merges them, and computes per-district
    cropland fraction using rasterio zonal statistics approach.
    ESA WorldCover class 40 = Cropland.
    """
    import rasterio
    from rasterio.merge import merge
    from rasterio.mask import mask as rio_mask
    from shapely.geometry import mapping

    ESA_CROPLAND_CLASS = 40

    # Open all tiles
    src_files = [rasterio.open(f) for f in tif_files]

    # Merge tiles into a single mosaic (in-memory)
    log.info("  Merging %d tiles...", len(src_files))
    mosaic, mosaic_transform = merge(src_files)
    mosaic = mosaic[0]   # single band: (H, W) uint8

    records = []
    for _, row in tqdm(district_gdf.iterrows(), total=len(district_gdf),
                       desc="Districts"):
        try:
            # Mask raster to district polygon
            geom_geojson = [mapping(row.geometry)]

            # Build a temporary in-memory dataset for masking
            with rasterio.MemoryFile() as memfile:
                with memfile.open(
                    driver="GTiff",
                    height=mosaic.shape[0],
                    width=mosaic.shape[1],
                    count=1,
                    dtype=mosaic.dtype,
                    crs="EPSG:4326",
                    transform=mosaic_transform,
                ) as dataset:
                    dataset.write(mosaic, 1)

                with memfile.open() as dataset:
                    masked_data, _ = rio_mask(
                        dataset, geom_geojson, crop=True, nodata=0
                    )
                    masked_band = masked_data[0]

            total_pixels    = np.count_nonzero(masked_band)
            cropland_pixels = np.sum(masked_band == ESA_CROPLAND_CLASS)
            crop_frac = cropland_pixels / total_pixels if total_pixels > 0 else 0.0

        except Exception as e:
            log.warning("  %s: rasterio mask failed (%s) — using centroid lookup",
                        row["district"], e)
            crop_frac = 0.5   # neutral fallback

        records.append({
            "district":          row["district"],
            "cropland_fraction": round(float(crop_frac), 4),
        })

    for src in src_files:
        src.close()

    df = pd.DataFrame(records)
    log.info(
        "  Cropland fractions: min=%.2f  mean=%.2f  max=%.2f",
        df["cropland_fraction"].min(),
        df["cropland_fraction"].mean(),
        df["cropland_fraction"].max(),
    )
    return df


def _cropland_from_synthetic(district_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Reads synthetic cropland fraction CSV (0.25° grid) and
    spatially averages grid cells inside each district polygon.
    """
    from shapely.geometry import Point

    syn_csv = DIR_ESA / "mh_cropland_fraction_synthetic.csv"
    grid_df = pd.read_csv(syn_csv)

    records = []
    for _, row in district_gdf.iterrows():
        geom    = row.geometry
        centroid = geom.centroid

        # Find grid cells inside district
        inside = []
        for _, gr in grid_df.iterrows():
            if geom.contains(Point(gr["lon"], gr["lat"])):
                inside.append(gr["cropland_fraction"])

        if inside:
            crop_frac = float(np.mean(inside))
        else:
            # Nearest grid cell to centroid
            dists = np.sqrt(
                (grid_df["lat"] - centroid.y) ** 2 +
                (grid_df["lon"] - centroid.x) ** 2
            )
            crop_frac = float(grid_df.loc[dists.idxmin(), "cropland_fraction"])

        records.append({
            "district":          row["district"],
            "cropland_fraction": round(crop_frac, 4),
        })

    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# 4. HISTORICAL DROUGHT FREQUENCY PER DISTRICT
# ─────────────────────────────────────────────────────────────────────────────

def compute_drought_frequency(imd_df: pd.DataFrame) -> pd.DataFrame:
    """
    For each district: fraction of years with rainfall < 90% of LPA.
    This is a static feature (doesn't vary by year) that captures
    historical vulnerability.
    """
    log.info("── Historical drought frequency ──────────────────────────────")

    freq = (
        imd_df.groupby("district")["is_drought_year"]
        .mean()
        .rename("historical_drought_freq")
        .reset_index()
    )
    freq["historical_drought_freq"] = freq["historical_drought_freq"].round(3)

    log.info(
        "  Most drought-prone: %s (%.0f%% of years)",
        freq.loc[freq["historical_drought_freq"].idxmax(), "district"],
        freq["historical_drought_freq"].max() * 100,
    )
    log.info(
        "  Least drought-prone: %s (%.0f%% of years)",
        freq.loc[freq["historical_drought_freq"].idxmin(), "district"],
        freq["historical_drought_freq"].min() * 100,
    )
    return freq


# ─────────────────────────────────────────────────────────────────────────────
# 5. ASSEMBLE FULL FEATURE TABLE
# ─────────────────────────────────────────────────────────────────────────────

def assemble_feature_table(
    imd_df:        pd.DataFrame,
    climate_df:    pd.DataFrame,
    cropland_df:   pd.DataFrame,
    drought_df:    pd.DataFrame,
    crop_cal_df:   pd.DataFrame,
    district_gdf:  gpd.GeoDataFrame,
) -> pd.DataFrame:
    """
    Joins all features into a single district × year panel.

    Final columns:
      year, district, agro_zone, state,
      jjas_mm_district, lpa_mm, rainfall_deficit_pct, is_drought_year,
      jjas_nino34, jjas_dmi, enso_phase, iod_phase, known_el_nino,
      cropland_fraction, rainfall_sensitivity_weight, dominant_kharif_crop,
      sowing_window, harvest_window,
      historical_drought_freq,
      centroid_lat, centroid_lon,
      composite_stress_score      ← weighted combination, input to ML
    """
    log.info("── Assembling feature table ──────────────────────────────────")

    # Base: district × year from IMD
    df = imd_df.copy()

    # Join climate indices (same value for all districts in a year)
    df = df.merge(climate_df, on="year", how="left")

    # Join static district features
    df = df.merge(cropland_df, on="district", how="left")
    df = df.merge(drought_df,  on="district", how="left")

    # Join crop calendar (district-level, static)
    crop_cols = [
        "district", "dominant_kharif_crop",
        "rainfall_sensitivity_weight", "sowing_window",
        "harvest_window", "agro_zone",
    ]
    df = df.merge(crop_cal_df[crop_cols], on="district", how="left")

    # Join district metadata (centroid, state name)
    meta = district_gdf[["district","centroid_lat","centroid_lon"]].copy()
    if "centroid_lat" not in district_gdf.columns:
        meta["centroid_lat"] = district_gdf.geometry.centroid.y.round(4)
        meta["centroid_lon"] = district_gdf.geometry.centroid.x.round(4)
    df = df.merge(meta, on="district", how="left")
    df["state"] = "Maharashtra"

    # ── Composite stress score ──────────────────────────────────────────────
    # A rule-based pre-score that the ML model uses as one of its features.
    # Range 0–1: higher = more stressed.
    #
    # Components:
    #   - rainfall_deficit_component:  normalised deficit (capped at 30% deficit = 1.0)
    #   - enso_component:              El Niño = 0.8, neutral = 0.4, La Niña = 0.0
    #   - iod_component:               negative = 0.7, neutral = 0.3, positive = 0.0
    #   - cropland_weight:             scales by how rainfed the district crop is

    def enso_score(phase):
        return {"el_nino": 0.8, "neutral": 0.4, "la_nina": 0.0}.get(phase, 0.4)

    def iod_score(phase):
        return {"negative": 0.7, "neutral": 0.3, "positive": 0.0}.get(phase, 0.3)

    deficit_component = np.clip(-df["rainfall_deficit_pct"] / 30, 0, 1)
    enso_component    = df["enso_phase"].apply(enso_score)
    iod_component     = df["iod_phase"].apply(iod_score)
    crop_weight       = df["rainfall_sensitivity_weight"].fillna(0.7)

    df["composite_stress_score"] = (
        (0.5 * deficit_component + 0.3 * enso_component + 0.2 * iod_component)
        * crop_weight
    ).round(4)

    # ── Risk label (target variable for ML) ────────────────────────────────
    # Based on composite score thresholds (will be refined by XGBoost in step 04)
    def risk_label(score):
        if score >= 0.55:  return "Critical"
        if score >= 0.40:  return "High"
        if score >= 0.25:  return "Moderate"
        return "Low"

    df["risk_label"] = df["composite_stress_score"].apply(risk_label)

    # Risk numeric (for ML)
    risk_map = {"Low": 0, "Moderate": 1, "High": 2, "Critical": 3}
    df["risk_numeric"] = df["risk_label"].map(risk_map)

    # ── Sort and clean ──────────────────────────────────────────────────────
    df = df.sort_values(["district", "year"]).reset_index(drop=True)
    df = df.round({"jjas_mm_district": 1, "rainfall_deficit_pct": 2,
                   "jjas_nino34": 3, "jjas_dmi": 3,
                   "composite_stress_score": 4})

    log.info(
        "  Feature table: %d rows × %d columns  (%d districts × %d years)",
        len(df), len(df.columns),
        df["district"].nunique(), df["year"].nunique(),
    )
    log.info("  Risk label distribution:\n%s",
             df["risk_label"].value_counts().to_string())

    return df


# ─────────────────────────────────────────────────────────────────────────────
# 6. STORE: GEOPARQUET + DUCKDB
# ─────────────────────────────────────────────────────────────────────────────

def store_outputs(
    feature_df:   pd.DataFrame,
    district_gdf: gpd.GeoDataFrame,
):
    """
    Saves:
      A) district_features.parquet   — flat table for ML (no geometry)
      B) feature_store.duckdb        — DuckDB DB with spatial extension
      C) maharashtra_districts_enriched.geojson  — 2026-forecast join for frontend
    """
    log.info("── Storing outputs ───────────────────────────────────────────")

    # ── A: GeoParquet (flat, no geometry) ──────────────────────────────────
    parquet_out = PROCESSED / "district_features.parquet"
    feature_df.to_parquet(parquet_out, index=False, engine="pyarrow")
    log.info("  ✓  %s  (%.1f MB)", parquet_out.relative_to(ROOT),
             parquet_out.stat().st_size / 1e6)

    # ── B: DuckDB feature store ─────────────────────────────────────────────
    db_out = PROCESSED / "feature_store.duckdb"
    if db_out.exists():
        db_out.unlink()   # fresh build each run

    con = duckdb.connect(str(db_out))

    # Load spatial extension if available (pre-installed on Windows/Mac builds)
    # Falls back gracefully — geometry stored as WKT string either way
    spatial_ok = False
    try:
        con.execute("LOAD spatial;")
        spatial_ok = True
        log.info("  DuckDB spatial extension loaded ✓")
    except Exception:
        try:
            con.execute("INSTALL spatial; LOAD spatial;")
            spatial_ok = True
            log.info("  DuckDB spatial extension installed and loaded ✓")
        except Exception as e:
            log.warning("  DuckDB spatial unavailable (%s) — storing geometry as WKT", e)

    # Main feature table
    con.execute("""
        CREATE TABLE district_features AS
        SELECT * FROM read_parquet(?)
    """, [str(parquet_out)])

    # District geometry table — geometry stored as WKT string (no ext needed)
    gdf_meta = district_gdf[["district","centroid_lat","centroid_lon","geometry"]].copy()
    gdf_meta["geometry_wkt"] = gdf_meta["geometry"].apply(lambda g: g.wkt)
    gdf_meta = gdf_meta.drop(columns="geometry")

    # Register as in-memory relation then create table
    con.register("_geom_tmp", gdf_meta)
    if spatial_ok:
        con.execute("""
            CREATE TABLE district_geometry AS
            SELECT district, centroid_lat, centroid_lon,
                   geometry_wkt,
                   ST_GeomFromText(geometry_wkt) AS geometry
            FROM _geom_tmp
        """)
    else:
        con.execute("""
            CREATE TABLE district_geometry AS
            SELECT district, centroid_lat, centroid_lon, geometry_wkt
            FROM _geom_tmp
        """)

    # Useful analytical views
    con.execute("""
        CREATE VIEW v_district_risk_latest AS
        SELECT
            district, agro_zone, dominant_kharif_crop,
            cropland_fraction, historical_drought_freq,
            jjas_mm_district, lpa_mm, rainfall_deficit_pct,
            jjas_nino34, jjas_dmi, enso_phase, iod_phase,
            composite_stress_score, risk_label, risk_numeric,
            centroid_lat, centroid_lon
        FROM district_features
        WHERE year = (SELECT MAX(year) FROM district_features)
        ORDER BY composite_stress_score DESC
    """)

    con.execute("""
        CREATE VIEW v_zone_summary AS
        SELECT
            agro_zone,
            year,
            ROUND(AVG(rainfall_deficit_pct), 2)      AS avg_deficit_pct,
            ROUND(AVG(composite_stress_score), 4)    AS avg_stress_score,
            COUNT(*) FILTER (WHERE risk_label = 'Critical') AS critical_districts,
            COUNT(*) FILTER (WHERE risk_label = 'High')     AS high_districts,
            COUNT(*)                                          AS total_districts
        FROM district_features
        GROUP BY agro_zone, year
        ORDER BY agro_zone, year
    """)

    con.execute("""
        CREATE VIEW v_enso_impact AS
        SELECT
            enso_phase,
            iod_phase,
            ROUND(AVG(rainfall_deficit_pct), 2)   AS avg_deficit_pct,
            ROUND(AVG(composite_stress_score), 4) AS avg_stress_score,
            COUNT(*) AS n_district_years
        FROM district_features
        GROUP BY enso_phase, iod_phase
        ORDER BY avg_stress_score DESC
    """)

    con.close()
    log.info("  ✓  %s  (%.1f MB)", db_out.relative_to(ROOT),
             db_out.stat().st_size / 1e6)

    # ── C: Enriched GeoJSON for frontend ───────────────────────────────────
    # Take the most recent year's risk scores and join to district geometries
    latest_year = feature_df["year"].max()
    latest = feature_df[feature_df["year"] == latest_year].copy()

    enrich_cols = [
        "district", "agro_zone", "dominant_kharif_crop",
        "cropland_fraction", "historical_drought_freq",
        "jjas_mm_district", "lpa_mm", "rainfall_deficit_pct",
        "jjas_nino34", "jjas_dmi", "enso_phase", "iod_phase",
        "composite_stress_score", "risk_label", "risk_numeric",
        "centroid_lat", "centroid_lon",
    ]
    enrich_df = latest[enrich_cols]

    geo_enrich = district_gdf[["district", "geometry"]].merge(
        enrich_df, on="district", how="left"
    )
    geo_out = PROCESSED / "maharashtra_districts_enriched.geojson"
    geo_enrich.to_file(geo_out, driver="GeoJSON")
    log.info("  ✓  %s  (year=%d, %d features)",
             geo_out.relative_to(ROOT), latest_year, len(geo_enrich))

    _print_sample_queries(db_out)


def _print_sample_queries(db_out: Path):
    """Run and print a few DuckDB queries to confirm the store is working."""
    log.info("── Sample DuckDB queries ─────────────────────────────────────")
    con = duckdb.connect(str(db_out))
    try:
        con.execute("LOAD spatial;")
    except Exception:
        pass



    log.info("  Top 5 most stressed districts (latest year):")
    rows = con.execute("""
        SELECT district, risk_label, composite_stress_score,
               rainfall_deficit_pct, enso_phase, iod_phase
        FROM v_district_risk_latest
        LIMIT 5
    """).fetchdf()
    for _, r in rows.iterrows():
        log.info(
            "    %-20s  %-8s  score=%.3f  deficit=%.1f%%  ENSO=%s  IOD=%s",
            r.district, r.risk_label, r.composite_stress_score,
            r.rainfall_deficit_pct, r.enso_phase, r.iod_phase,
        )

    log.info("  ENSO × IOD interaction on drought stress:")
    rows2 = con.execute("SELECT * FROM v_enso_impact").fetchdf()
    for _, r in rows2.iterrows():
        log.info(
            "    ENSO=%-8s  IOD=%-8s  avg_deficit=%.1f%%  avg_stress=%.3f  n=%d",
            r.enso_phase, r.iod_phase, r.avg_deficit_pct,
            r.avg_stress_score, r.n_district_years,
        )
    con.close()


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("=" * 60)
    log.info("Kharif Crop Stress Risk Mapper — Step 02: Spatial Join")
    log.info("=" * 60)

    # Load district boundaries
    log.info("Loading district boundaries...")
    district_gdf = gpd.read_file(
        DIR_BOUNDARIES / "maharashtra_districts.geojson"
    )
    district_gdf = district_gdf.set_crs("EPSG:4326", allow_override=True)

    # Add centroid columns if not present
    if "centroid_lat" not in district_gdf.columns:
        district_gdf["centroid_lat"] = district_gdf.geometry.centroid.y.round(4)
        district_gdf["centroid_lon"] = district_gdf.geometry.centroid.x.round(4)

    log.info("  %d districts loaded", len(district_gdf))

    # Run pipeline steps
    imd_df     = read_imd_grd_files(district_gdf)
    climate_df = read_climate_indices()
    cropland_df = compute_cropland_fraction(district_gdf)
    drought_df  = compute_drought_frequency(imd_df)
    crop_cal_df = pd.read_csv(DIR_ICRISAT / "mh_kharif_crop_calendar.csv")

    feature_df = assemble_feature_table(
        imd_df, climate_df, cropland_df,
        drought_df, crop_cal_df, district_gdf,
    )

    store_outputs(feature_df, district_gdf)

    log.info("=" * 60)
    log.info("Step 02 complete — ready for 03_features.py")
    log.info("=" * 60)
