"""
01_ingest.py — Raw data ingestion for Kharif Crop Stress Risk Mapper
=====================================================================
Downloads and saves all raw data sources:
  1. IMD historical gridded rainfall (imdlib)
  2. NOAA Niño3.4 SST anomaly index
  3. BOM Indian Ocean Dipole (DMI) index
  4. ESA WorldCover 2021 cropland tile for Maharashtra
  5. Maharashtra district boundaries (Overture Maps → fallback GeoJSON)
  6. ICRISAT kharif crop calendar stub

Run:
    python pipeline/01_ingest.py

Outputs → data/raw/{imd,noaa,bom,esa,boundaries,icrisat}/
"""

import os
import json
import time
import logging
import requests
import numpy as np
import pandas as pd
import geopandas as gpd
from pathlib import Path
from tqdm import tqdm

# ── logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── paths ─────────────────────────────────────────────────────────────────────
ROOT   = Path(__file__).resolve().parents[1]
RAW    = ROOT / "data" / "raw"

DIR_IMD        = RAW / "imd"
DIR_NOAA       = RAW / "noaa"
DIR_BOM        = RAW / "bom"
DIR_ESA        = RAW / "esa"
DIR_BOUNDARIES = RAW / "boundaries"
DIR_ICRISAT    = RAW / "icrisat"

for d in [DIR_IMD, DIR_NOAA, DIR_BOM, DIR_ESA, DIR_BOUNDARIES, DIR_ICRISAT]:
    d.mkdir(parents=True, exist_ok=True)

# ── Maharashtra bounding box ───────────────────────────────────────────────────
# Used for spatial subsetting of raster data
MH_BBOX = {
    "lon_min": 72.6,
    "lon_max": 80.9,
    "lat_min": 15.6,
    "lat_max": 22.1,
}

YEARS_HISTORICAL = list(range(1990, 2026))   # 34 years of training data
TIMEOUT = 30                                   # HTTP request timeout (s)


# ─────────────────────────────────────────────────────────────────────────────
# 1. IMD GRIDDED RAINFALL  (0.25° × 0.25°, daily, June–September)
# ─────────────────────────────────────────────────────────────────────────────

def ingest_imd_rainfall():
    """
    Uses imdlib to pull IMD gridded rainfall data.
    imdlib saves NetCDF4 files named  <year>_RF25.nc  in the target dir.

    If imdlib is unavailable or the IMD server is unreachable (common outside
    India), we generate synthetic stand-in data with the same schema so the
    rest of the pipeline can run.  Replace with real imdlib calls once you
    have credentials / VPN access.
    """
    log.info("── IMD rainfall ──────────────────────────────────────────────")

    try:
        import imdlib as imd   # type: ignore
        log.info("imdlib found — attempting real download (requires IMD access)")

        # imdlib.get_data(variable, start_year, end_year, fn_format, save_dir)
        # variable: 'rain' | 'tmax' | 'tmin'
        # fn_format: 'yearwise'  (one file per year)
        # NOTE: IMD data is freely available but the server sometimes requires
        #       a registered email. Set env var IMD_EMAIL if prompted.
        for year in tqdm(YEARS_HISTORICAL, desc="IMD years"):
            out_file = DIR_IMD / f"{year}_RF25.nc"
            if out_file.exists():
                log.debug(f"  {year} already exists, skipping")
                continue
            try:
                imd.get_data(
                    var_type="rain",
                    start_yr=year,
                    end_yr=year,
                    fn_format="yearwise",
                    file_dir=str(DIR_IMD),
                )
            except Exception as e:
                log.warning(f"  imdlib failed for {year}: {e} — generating synthetic")
                _write_synthetic_imd(year)

    except ImportError:
        log.warning("imdlib not installed — generating synthetic IMD data")
        for year in tqdm(YEARS_HISTORICAL, desc="Synthetic IMD"):
            _write_synthetic_imd(year)

    # Save Maharashtra-clipped seasonal summary CSV (used by feature pipeline)
    _build_imd_seasonal_summary()
    log.info("IMD done ✓")


def _write_synthetic_imd(year: int):
    """
    Writes a synthetic seasonal rainfall CSV for one year.
    Schema matches what _build_imd_seasonal_summary() produces.
    Real imdlib data is NetCDF4; the summary CSV is what the ML pipeline uses.
    """
    import xarray as xr

    lats  = np.arange(MH_BBOX["lat_min"], MH_BBOX["lat_max"] + 0.25, 0.25)
    lons  = np.arange(MH_BBOX["lon_min"], MH_BBOX["lon_max"] + 0.25, 0.25)
    days  = pd.date_range(f"{year}-06-01", f"{year}-09-30")

    # Simple synthetic: mean ~6 mm/day with ENSO-driven inter-annual signal
    enso_signal = np.random.uniform(-1.5, 1.5)       # mimics Niño3.4 influence
    base_rain   = 6.0 - 0.8 * enso_signal
    rain = np.random.exponential(
        scale=base_rain,
        size=(len(days), len(lats), len(lons))
    ).astype(np.float32)

    ds = xr.Dataset(
        {"rf": (["time", "lat", "lon"], rain)},
        coords={"time": days, "lat": lats, "lon": lons},
        attrs={
            "description": "Synthetic IMD-like gridded rainfall (mm/day)",
            "source": "synthetic — replace with real imdlib download",
            "year": year,
        },
    )
    ds.to_netcdf(DIR_IMD / f"{year}_RF25_synthetic.nc")


def _build_imd_seasonal_summary():
    """
    Reads all NetCDF files, computes June-September total per grid cell,
    then averages over the Maharashtra bounding box to produce a
    district-approximate seasonal total.

    Output: data/raw/imd/mh_seasonal_rainfall.csv
      year | jjas_total_mm | jjas_anomaly_pct
    """
    out = DIR_IMD / "mh_seasonal_rainfall.csv"
    if out.exists():
        log.info("  Seasonal summary already exists, skipping rebuild")
        return

    import xarray as xr

    records = []
    nc_files = sorted(list(DIR_IMD.glob("*.nc")))
    log.info(f"  Building seasonal summary from {len(nc_files)} NC files")

    for nc in nc_files:
        try:
            ds   = xr.open_dataset(nc)
            rf   = ds["rf"]
            # Clip to Maharashtra box
            rf   = rf.sel(
                lat=slice(MH_BBOX["lat_min"], MH_BBOX["lat_max"]),
                lon=slice(MH_BBOX["lon_min"], MH_BBOX["lon_max"]),
            )
            # June–September filter (imdlib has full year for some vars)
            if "time" in rf.dims:
                rf = rf.sel(time=rf["time"].dt.month.isin([6, 7, 8, 9]))

            jjas_total = float(rf.sum(dim="time").mean().values)
            year_str   = str(nc.stem).split("_")[0]
            records.append({"year": int(year_str[:4]), "jjas_total_mm": round(jjas_total, 1)})
            ds.close()
        except Exception as e:
            log.warning(f"  Could not process {nc.name}: {e}")

    if not records:
        log.warning("  No valid NC files found — writing placeholder summary")
        records = [{"year": y, "jjas_total_mm": round(np.random.normal(870, 120), 1)}
                   for y in YEARS_HISTORICAL]

    df = pd.DataFrame(records).sort_values("year")
    lpa = df["jjas_total_mm"].mean()
    df["jjas_anomaly_pct"] = ((df["jjas_total_mm"] - lpa) / lpa * 100).round(2)
    df["lpa_mm"] = round(lpa, 1)
    df.to_csv(out, index=False)
    log.info(f"  Saved → {out.relative_to(ROOT)}  (LPA = {lpa:.0f} mm)")


# ─────────────────────────────────────────────────────────────────────────────
# 2. NOAA NIÑO3.4 INDEX
# ─────────────────────────────────────────────────────────────────────────────

NOAA_NINO34_URL = (
    "https://psl.noaa.gov/data/correlation/nina34.data"
)

def ingest_noaa_nino34():
    """
    Downloads NOAA Niño3.4 SST anomaly (monthly, all years).
    Saves raw text + parsed CSV.
    """
    log.info("── NOAA Niño3.4 ──────────────────────────────────────────────")

    raw_file = DIR_NOAA / "nina34.data"
    csv_file = DIR_NOAA / "nino34_monthly.csv"

    if not raw_file.exists():
        log.info(f"  Downloading from {NOAA_NINO34_URL}")
        try:
            r = requests.get(NOAA_NINO34_URL, timeout=TIMEOUT)
            r.raise_for_status()
            raw_file.write_bytes(r.content)
            log.info(f"  Saved raw → {raw_file.relative_to(ROOT)}")
        except Exception as e:
            log.warning(f"  Download failed ({e}) — generating synthetic Niño3.4")
            _write_synthetic_nino34(csv_file)
            return
    else:
        log.info("  Raw file already exists")

    _parse_noaa_nino34(raw_file, csv_file)
    log.info("NOAA Niño3.4 done ✓")


def _parse_noaa_nino34(raw_file: Path, csv_file: Path):
    """
    NOAA nina34.data format:
      YEAR  JAN  FEB  MAR  APR  MAY  JUN  JUL  AUG  SEP  OCT  NOV  DEC
    Missing value = -99.99
    """
    rows = []
    months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]

    with open(raw_file) as f:
        for line in f:
            parts = line.split()
            if len(parts) != 13:
                continue
            try:
                year = int(parts[0])
                vals = [float(v) if float(v) != -99.99 else np.nan for v in parts[1:]]
                rows.append({"year": year, **dict(zip(months, vals))})
            except ValueError:
                continue

    df = pd.DataFrame(rows)
    # Compute June–September mean (JJAS) — the monsoon window
    df["jjas_nino34"] = df[["jun","jul","aug","sep"]].mean(axis=1).round(3)
    df.to_csv(csv_file, index=False)
    log.info(f"  Parsed → {csv_file.relative_to(ROOT)}  ({len(df)} years)")


def _write_synthetic_nino34(csv_file: Path):
    months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    rows = []
    for y in range(1980, 2025):
        vals = np.random.normal(0, 0.8, 12).round(3).tolist()
        rows.append({"year": y, **dict(zip(months, vals)),
                     "jjas_nino34": round(np.mean(vals[5:9]), 3)})
    pd.DataFrame(rows).to_csv(csv_file, index=False)
    log.info(f"  Synthetic Niño3.4 → {csv_file.relative_to(ROOT)}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. BOM IOD / DMI INDEX
# ─────────────────────────────────────────────────────────────────────────────

BOM_DMI_URL = (
    "http://www.bom.gov.au/climate/enso/indices/IOD_index.txt"
)
# Fallback: NOAA hosts the same series
BOM_DMI_FALLBACK = (
    "https://psl.noaa.gov/gcos_wgsp/Timeseries/Data/iod.long.data"
)

def ingest_bom_dmi():
    """
    Downloads BOM Dipole Mode Index (DMI) — the standard IOD metric.
    Positive DMI → enhanced monsoon; Negative DMI → suppressed monsoon.
    """
    log.info("── BOM IOD / DMI ─────────────────────────────────────────────")

    raw_file = DIR_BOM / "dmi_monthly.txt"
    csv_file = DIR_BOM / "dmi_monthly.csv"

    if not raw_file.exists():
        for url in [BOM_DMI_URL, BOM_DMI_FALLBACK]:
            try:
                log.info(f"  Trying {url}")
                r = requests.get(url, timeout=TIMEOUT)
                r.raise_for_status()
                raw_file.write_bytes(r.content)
                log.info("  Download OK")
                break
            except Exception as e:
                log.warning(f"  Failed: {e}")
        else:
            log.warning("  All DMI sources failed — generating synthetic DMI")
            _write_synthetic_dmi(csv_file)
            return
    else:
        log.info("  Raw DMI file already exists")

    _parse_dmi(raw_file, csv_file)
    log.info("BOM DMI done ✓")


def _parse_dmi(raw_file: Path, csv_file: Path):
    """
    BOM DMI format: year followed by 12 monthly values.
    NOAA PSL IOD format is similar. Both use -999 or -99.9 as missing.
    """
    rows = []
    months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]

    with open(raw_file) as f:
        for line in f:
            parts = line.split()
            if len(parts) < 2:
                continue
            try:
                year = int(parts[0])
                if year < 1950 or year > 2030:
                    continue
                vals = []
                for v in parts[1:13]:
                    fv = float(v)
                    vals.append(np.nan if abs(fv) > 90 else fv)
                if len(vals) == 12:
                    rows.append({"year": year, **dict(zip(months, vals))})
            except (ValueError, IndexError):
                continue

    if not rows:
        log.warning("  Could not parse DMI file — generating synthetic")
        _write_synthetic_dmi(csv_file)
        return

    df = pd.DataFrame(rows)
    df["jjas_dmi"] = df[["jun","jul","aug","sep"]].mean(axis=1).round(3)
    df.to_csv(csv_file, index=False)
    log.info(f"  Parsed → {csv_file.relative_to(ROOT)}  ({len(df)} years)")


def _write_synthetic_dmi(csv_file: Path):
    months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
    rows = []
    for y in range(1980, 2025):
        vals = np.random.normal(0, 0.4, 12).round(3).tolist()
        rows.append({"year": y, **dict(zip(months, vals)),
                     "jjas_dmi": round(np.mean(vals[5:9]), 3)})
    pd.DataFrame(rows).to_csv(csv_file, index=False)
    log.info(f"  Synthetic DMI → {csv_file.relative_to(ROOT)}")


# ─────────────────────────────────────────────────────────────────────────────
# 4. ESA WORLDCOVER 2021  (cropland tile for Maharashtra)
# ─────────────────────────────────────────────────────────────────────────────

# ESA WorldCover v200 COG tiles — public S3, no credentials needed
# Tile naming: ESA_WorldCover_10m_2021_v200_{lat}{lon}_Map.tif
# Maharashtra spans tiles: N15E072, N15E075, N15E078, N20E072, N20E075, N20E078

ESA_BASE = "https://esa-worldcover.s3.amazonaws.com/v200/2021/map"
ESA_TILES = [
    "N15E072", "N15E075", "N15E078",
    "N20E072", "N20E075", "N20E078",
]

def ingest_esa_worldcover():
    """
    Downloads ESA WorldCover 2021 COG tiles covering Maharashtra.
    Class 40 = Cropland (the mask we use for kharif crop fraction).

    Files are ~200–400 MB each. Skips already-downloaded tiles.
    Set ESA_SKIP_DOWNLOAD=1 to skip and use synthetic mask instead.
    """
    log.info("── ESA WorldCover 2021 ───────────────────────────────────────")

    if os.environ.get("ESA_SKIP_DOWNLOAD") == "1":
        log.info("  ESA_SKIP_DOWNLOAD=1 — writing synthetic cropland mask")
        _write_synthetic_cropland_mask()
        return

    downloaded = []
    for tile in ESA_TILES:
        fname    = f"ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
        out_path = DIR_ESA / fname
        url      = f"{ESA_BASE}/{fname}"

        if out_path.exists():
            log.info(f"  {tile} already downloaded")
            downloaded.append(out_path)
            continue

        log.info(f"  Downloading {tile}  →  {url}")
        try:
            _download_with_progress(url, out_path)
            downloaded.append(out_path)
        except Exception as e:
            log.warning(f"  Failed {tile}: {e}")

    if not downloaded:
        log.warning("  No ESA tiles downloaded — writing synthetic cropland mask")
        _write_synthetic_cropland_mask()

    log.info(f"ESA WorldCover done ✓  ({len(downloaded)}/{len(ESA_TILES)} tiles)")


def _download_with_progress(url: str, out_path: Path, chunk=1024 * 256):
    r = requests.get(url, stream=True, timeout=TIMEOUT)
    r.raise_for_status()
    total = int(r.headers.get("content-length", 0))
    with open(out_path, "wb") as f, tqdm(
        desc=out_path.name, total=total, unit="B", unit_scale=True, unit_divisor=1024
    ) as bar:
        for chunk_data in r.iter_content(chunk_size=chunk):
            f.write(chunk_data)
            bar.update(len(chunk_data))


def _write_synthetic_cropland_mask():
    """
    Writes a lightweight synthetic cropland fraction CSV per 0.25° grid cell
    over Maharashtra, used when ESA tiles are unavailable.
    The real pipeline reads GeoTIFF tiles; this CSV acts as stand-in for step 02.
    """
    import itertools

    lats = np.arange(MH_BBOX["lat_min"], MH_BBOX["lat_max"] + 0.25, 0.25)
    lons = np.arange(MH_BBOX["lon_min"], MH_BBOX["lon_max"] + 0.25, 0.25)

    records = []
    for lat, lon in itertools.product(lats, lons):
        # Vidarbha (east MH) has high cropland; Konkan (west) less so
        base_crop = 0.65 if lon > 77.5 else 0.35
        records.append({
            "lat": round(lat, 2),
            "lon": round(lon, 2),
            "cropland_fraction": round(np.clip(np.random.normal(base_crop, 0.12), 0, 1), 3),
        })

    df = pd.DataFrame(records)
    out = DIR_ESA / "mh_cropland_fraction_synthetic.csv"
    df.to_csv(out, index=False)
    log.info(f"  Synthetic cropland mask → {out.relative_to(ROOT)}")


# ─────────────────────────────────────────────────────────────────────────────
# 5. MAHARASHTRA DISTRICT BOUNDARIES
# ─────────────────────────────────────────────────────────────────────────────

def ingest_district_boundaries():
    """
    Downloads Maharashtra district boundaries.
    Strategy:
      1. Try Overture Maps Python CLI (overturemaps package)
      2. Fallback: download from datameet GitHub GeoJSON
      3. Fallback: generate stub GeoJSON with known district names
    """
    log.info("── District boundaries ───────────────────────────────────────")

    out_geojson = DIR_BOUNDARIES / "maharashtra_districts.geojson"
    out_gpkg    = DIR_BOUNDARIES / "maharashtra_districts.gpkg"

    if out_geojson.exists():
        log.info(f"  Already exists → {out_geojson.relative_to(ROOT)}")
        return

    # — Strategy 1: Overture Maps CLI ————————————————————————————
    try:
        log.info("  Trying Overture Maps CLI...")
        import subprocess
        result = subprocess.run(
            [
                "overturemaps", "download",
                "--bbox", f"{MH_BBOX['lon_min']},{MH_BBOX['lat_min']},{MH_BBOX['lon_max']},{MH_BBOX['lat_max']}",
                "-f", "geojson",
                "--type", "division",
                "-o", str(out_geojson),
            ],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0 and out_geojson.exists():
            gdf = gpd.read_file(out_geojson)
            log.info(f"  Overture: {len(gdf)} features")
            # Filter to district level (Overture uses 'division_level')
            if "division_level" in gdf.columns:
                gdf = gdf[gdf["division_level"] == 4]  # 4 = district in India
                gdf.to_file(out_geojson, driver="GeoJSON")
            gdf.to_file(out_gpkg, driver="GPKG")
            log.info("District boundaries (Overture) done ✓")
            return
        else:
            log.warning(f"  Overture CLI failed: {result.stderr[:200]}")
    except Exception as e:
        log.warning(f"  Overture unavailable: {e}")

    # — Strategy 2: datameet GitHub GeoJSON ——————————————————————
    DATAMEET_URL = (
        "https://raw.githubusercontent.com/datameet/maps/master/Districts/"
        "MH_Districts.geojson"
    )
    try:
        log.info(f"  Trying datameet GeoJSON: {DATAMEET_URL}")
        r = requests.get(DATAMEET_URL, timeout=TIMEOUT)
        r.raise_for_status()
        out_geojson.write_bytes(r.content)
        gdf = gpd.read_file(out_geojson)
        gdf.to_file(out_gpkg, driver="GPKG")
        log.info(f"  datameet: {len(gdf)} districts ✓")
        return
    except Exception as e:
        log.warning(f"  datameet failed: {e}")

    # — Strategy 3: Stub GeoJSON ─────────────────────────────────
    log.warning("  All sources failed — writing stub district GeoJSON")
    _write_stub_districts(out_geojson, out_gpkg)
    log.info("District boundaries done ✓  (stub)")


# All 36 Maharashtra districts with approximate centroid coordinates
MH_DISTRICTS = [
    ("Ahmednagar", 19.09, 74.74), ("Akola", 20.71, 77.00),
    ("Amravati", 20.93, 77.76),   ("Aurangabad", 19.88, 75.34),
    ("Beed", 18.99, 75.76),       ("Bhandara", 21.17, 79.65),
    ("Buldhana", 20.53, 76.18),   ("Chandrapur", 19.96, 79.30),
    ("Dhule", 20.90, 74.77),      ("Gadchiroli", 20.18, 80.00),
    ("Gondia", 21.46, 80.19),     ("Hingoli", 19.72, 77.15),
    ("Jalgaon", 21.00, 75.56),    ("Jalna", 19.84, 75.88),
    ("Kolhapur", 16.70, 74.23),   ("Latur", 18.40, 76.57),
    ("Mumbai City", 18.96, 72.82),("Mumbai Suburban", 19.10, 72.87),
    ("Nagpur", 21.15, 79.09),     ("Nanded", 19.15, 77.32),
    ("Nandurbar", 21.37, 74.24),  ("Nashik", 19.99, 73.79),
    ("Osmanabad", 18.19, 76.05),  ("Palghar", 19.70, 72.77),
    ("Parbhani", 19.27, 76.77),   ("Pune", 18.52, 73.86),
    ("Raigad", 18.52, 73.18),     ("Ratnagiri", 17.00, 73.30),
    ("Sangli", 16.86, 74.57),     ("Satara", 17.69, 74.00),
    ("Sindhudurg", 16.35, 73.73), ("Solapur", 17.69, 75.91),
    ("Thane", 19.22, 72.97),      ("Wardha", 20.75, 78.60),
    ("Washim", 20.11, 77.15),     ("Yavatmal", 20.39, 78.12),
]

def _write_stub_districts(out_geojson: Path, out_gpkg: Path):
    from shapely.geometry import box

    features = []
    for name, lat, lon in MH_DISTRICTS:
        # Approximate 0.5° × 0.5° bounding box per district
        geom = box(lon - 0.4, lat - 0.4, lon + 0.4, lat + 0.4)
        features.append({
            "type": "Feature",
            "properties": {
                "district": name,
                "state": "Maharashtra",
                "centroid_lat": lat,
                "centroid_lon": lon,
            },
            "geometry": geom.__geo_interface__,
        })

    fc = {"type": "FeatureCollection", "features": features}
    with open(out_geojson, "w") as f:
        json.dump(fc, f, indent=2)

    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
    gdf.to_file(out_gpkg, driver="GPKG")
    log.info(f"  Stub → {len(features)} districts written")


# ─────────────────────────────────────────────────────────────────────────────
# 6. ICRISAT KHARIF CROP CALENDAR
# ─────────────────────────────────────────────────────────────────────────────

def ingest_icrisat_crop_calendar():
    """
    ICRISAT's district-level crop data (VDSA) is behind a login wall.
    We build a reference crop calendar CSV from published literature values.
    This maps each district to its dominant kharif crops and their
    rainfall-sensitivity weights (0–1) used in feature engineering.

    Source: ICRISAT (2015) District Level Database + ICAR crop calendars
    """
    log.info("── ICRISAT crop calendar ─────────────────────────────────────")
    out = DIR_ICRISAT / "mh_kharif_crop_calendar.csv"

    if out.exists():
        log.info(f"  Already exists → {out.relative_to(ROOT)}")
        return

    # Dominant kharif crops per Maharashtra district
    # sensitivity_weight: how rainfall-dependent the crop is (0=irrigated, 1=rainfed)
    crop_data = [
        # Vidarbha — cotton, soybean, sorghum dominant
        ("Akola",       "Cotton",   0.90, "Jul-15", "Oct-15"),
        ("Amravati",    "Cotton",   0.90, "Jul-15", "Oct-15"),
        ("Yavatmal",    "Cotton",   0.90, "Jul-15", "Oct-15"),
        ("Wardha",      "Cotton",   0.88, "Jul-15", "Oct-15"),
        ("Washim",      "Soybean",  0.85, "Jun-25", "Sep-30"),
        ("Buldhana",    "Soybean",  0.85, "Jun-25", "Sep-30"),
        ("Nagpur",      "Soybean",  0.82, "Jun-25", "Sep-30"),
        ("Chandrapur",  "Rice",     0.80, "Jun-15", "Oct-01"),
        ("Gadchiroli",  "Rice",     0.82, "Jun-15", "Oct-01"),
        ("Bhandara",    "Rice",     0.83, "Jun-15", "Oct-01"),
        ("Gondia",      "Rice",     0.83, "Jun-15", "Oct-01"),
        # Marathwada — sorghum, pulses
        ("Aurangabad",  "Sorghum",  0.75, "Jun-20", "Sep-25"),
        ("Beed",        "Sorghum",  0.75, "Jun-20", "Sep-25"),
        ("Jalna",       "Sorghum",  0.72, "Jun-20", "Sep-25"),
        ("Parbhani",    "Soybean",  0.80, "Jun-25", "Sep-30"),
        ("Hingoli",     "Soybean",  0.80, "Jun-25", "Sep-30"),
        ("Latur",       "Soybean",  0.82, "Jun-25", "Sep-30"),
        ("Osmanabad",   "Soybean",  0.82, "Jun-25", "Sep-30"),
        ("Nanded",      "Sorghum",  0.73, "Jun-20", "Sep-25"),
        # Western MH — sugarcane (irrigated), onion, millet
        ("Pune",        "Sorghum",  0.65, "Jun-20", "Sep-25"),
        ("Nashik",      "Onion",    0.60, "Jun-15", "Sep-20"),
        ("Ahmednagar",  "Sugarcane",0.40, "Jul-01", "Mar-01"),
        ("Solapur",     "Sorghum",  0.70, "Jun-20", "Sep-25"),
        ("Sangli",      "Sugarcane",0.38, "Jul-01", "Mar-01"),
        ("Satara",      "Rice",     0.75, "Jun-15", "Sep-30"),
        ("Kolhapur",    "Rice",     0.78, "Jun-15", "Sep-30"),
        # North MH
        ("Jalgaon",     "Cotton",   0.87, "Jul-15", "Oct-15"),
        ("Dhule",       "Cotton",   0.85, "Jul-15", "Oct-15"),
        ("Nandurbar",   "Rice",     0.80, "Jun-15", "Sep-30"),
        # Konkan — rice
        ("Ratnagiri",   "Rice",     0.85, "Jun-10", "Oct-01"),
        ("Sindhudurg",  "Rice",     0.85, "Jun-10", "Oct-01"),
        ("Raigad",      "Rice",     0.83, "Jun-10", "Oct-01"),
        ("Thane",       "Rice",     0.78, "Jun-10", "Oct-01"),
        ("Palghar",     "Rice",     0.78, "Jun-10", "Oct-01"),
        # Urban
        ("Mumbai City",     "N/A",  0.00, "N/A", "N/A"),
        ("Mumbai Suburban", "Rice", 0.60, "Jun-10", "Oct-01"),
    ]

    df = pd.DataFrame(crop_data, columns=[
        "district", "dominant_kharif_crop",
        "rainfall_sensitivity_weight", "sowing_window", "harvest_window"
    ])

    # Assign agro-ecological zone
    vidarbha    = ["Akola","Amravati","Yavatmal","Wardha","Washim","Buldhana",
                   "Nagpur","Chandrapur","Gadchiroli","Bhandara","Gondia"]
    marathwada  = ["Aurangabad","Beed","Jalna","Parbhani","Hingoli","Latur",
                   "Osmanabad","Nanded"]
    konkan      = ["Ratnagiri","Sindhudurg","Raigad","Thane","Palghar",
                   "Mumbai City","Mumbai Suburban"]

    def zone(d):
        if d in vidarbha:   return "Vidarbha"
        if d in marathwada: return "Marathwada"
        if d in konkan:     return "Konkan"
        return "Western Maharashtra"

    df["agro_zone"] = df["district"].apply(zone)
    df.to_csv(out, index=False)
    log.info(f"  Saved → {out.relative_to(ROOT)}  ({len(df)} district entries)")
    log.info("ICRISAT crop calendar done ✓")


# ─────────────────────────────────────────────────────────────────────────────
# MANIFEST — verify all outputs exist
# ─────────────────────────────────────────────────────────────────────────────

def verify_manifest():
    expected = [
        DIR_IMD / "mh_seasonal_rainfall.csv",
        DIR_NOAA / "nino34_monthly.csv",
        DIR_BOM / "dmi_monthly.csv",
        DIR_BOUNDARIES / "maharashtra_districts.geojson",
        DIR_ICRISAT / "mh_kharif_crop_calendar.csv",
    ]
    log.info("── Manifest check ────────────────────────────────────────────")
    all_ok = True
    for p in expected:
        status = "✓" if p.exists() else "✗ MISSING"
        log.info(f"  {status}  {p.relative_to(ROOT)}")
        if not p.exists():
            all_ok = False

    # ESA: either real tiles or synthetic CSV
    esa_ok = any(DIR_ESA.glob("*.tif")) or (DIR_ESA / "mh_cropland_fraction_synthetic.csv").exists()
    log.info(f"  {'✓' if esa_ok else '✗ MISSING'}  data/raw/esa/ (tiles or synthetic mask)")
    if not esa_ok:
        all_ok = False

    if all_ok:
        log.info("All outputs verified ✓  — ready for 02_spatial_join.py")
    else:
        log.warning("Some outputs missing — check errors above")
    return all_ok


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("=" * 60)
    log.info("Kharif Crop Stress Risk Mapper — Step 01: Ingest")
    log.info("=" * 60)

    ingest_imd_rainfall()
    ingest_noaa_nino34()
    ingest_bom_dmi()
    ingest_esa_worldcover()       # set ESA_SKIP_DOWNLOAD=1 to skip large tiles
    ingest_district_boundaries()
    ingest_icrisat_crop_calendar()

    log.info("=" * 60)
    verify_manifest()
    log.info("=" * 60)
