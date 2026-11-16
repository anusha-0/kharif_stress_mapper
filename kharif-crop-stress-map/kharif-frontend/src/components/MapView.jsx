import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DISTRICTS } from '../data/districtData';

// Zone bounding boxes for zoom-to-zone animation
const ZONE_BOUNDS = {
  "Vidarbha":            [[76.5, 19.5], [80.5, 21.8]],
  "Marathwada":          [[74.8, 17.8], [78.2, 20.2]],
  "Western Maharashtra": [[72.5, 15.8], [76.5, 21.5]],
  "Konkan":              [[72.5, 15.5], [73.8, 20.0]],
};

const RISK_COLORS   = { Critical:"#dc2626", High:"#ea580c", Moderate:"#ca8a04", Low:"#16a34a" };
const RISK_GLOW     = { Critical:"rgba(220,38,38,0.18)", High:"rgba(234,88,12,0.15)", Moderate:"rgba(202,138,4,0.13)", Low:"rgba(22,163,74,0.10)" };
const RISK_ORDER    = { Critical:4, High:3, Moderate:2, Low:1 };

function buildGeoJSON(allDistricts, filteredNames) {
  return {
    type: "FeatureCollection",
    features: allDistricts
      .slice()
      .sort((a,b) => (RISK_ORDER[a.risk]||0) - (RISK_ORDER[b.risk]||0))
      .map(d => {
        const R = 0.36;
        const steps = 48;
        const coords = Array.from({length:steps+1}, (_,i) => {
          const a = (i/steps)*2*Math.PI;
          return [d.lon + R*Math.cos(a), d.lat + R*Math.sin(a)];
        });
        const active = filteredNames.has(d.district);
        return {
          type:"Feature",
          properties:{ ...d, active, color: RISK_COLORS[d.risk]||"#94a3b8", glow: RISK_GLOW[d.risk]||"rgba(0,0,0,0.05)" },
          geometry:{ type:"Polygon", coordinates:[coords] },
        };
      }),
  };
}

export default function MapView({ districts, activeZone }) {
  const mapRef      = useRef(null);
  const mapInstance = useRef(null);
  const popup       = useRef(null);
  const [tooltip, setTooltip]   = useState(null);
  const [tooltipPos, setTooltipPos] = useState({x:0,y:0});
  const [mapReady, setMapReady] = useState(false);

  // Initialise map once
  useEffect(() => {
    if (mapInstance.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: {
        version:8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources:{
          cartodb:{
            type:"raster",
            tiles:[
              "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
              "https://d.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
            ],
            tileSize:256,
            attribution:"© CARTO © OpenStreetMap contributors",
          },
        },
        layers:[
          { id:"carto-base", type:"raster", source:"cartodb", paint:{ "raster-opacity":0.9, "raster-saturation":-0.3, "raster-brightness-min":0.05 } },
        ],
      },
      center:[76.8, 18.8],
      zoom: window.innerWidth <= 860 ? 5.5 : 6.2,
      maxZoom:11, minZoom:4.5,
    });

    map.on("load", () => {
      // ── glow / halo layer (blurred wider polygon) ──────────────────────
      map.addSource("districts-glow", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
      map.addLayer({
        id:"district-glow", type:"fill", source:"districts-glow",
        paint:{
          "fill-color":["get","glow"],
          "fill-opacity":["case",["get","active"],0.9,0.15],
        },
      });

      // ── main fill ───────────────────────────────────────────────────────
      map.addSource("districts", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
      map.addLayer({
        id:"district-fill", type:"fill", source:"districts",
        paint:{
          "fill-color":["get","color"],
          "fill-opacity":["case",["get","active"],0.72,0.12],
        },
      });

      // ── border ──────────────────────────────────────────────────────────
      map.addLayer({
        id:"district-border", type:"line", source:"districts",
        paint:{
          "line-color":["get","color"],
          "line-width":["case",["get","active"],1.8,0.4],
          "line-opacity":["case",["get","active"],0.9,0.3],
        },
      });

      // ── hover highlight ─────────────────────────────────────────────────
      map.addLayer({
        id:"district-hover-fill", type:"fill", source:"districts",
        paint:{ "fill-color":["get","color"], "fill-opacity":0 },
      });

      // ── district name labels ─────────────────────────────────────────────
      map.addSource("labels", { type:"geojson", data:{ type:"FeatureCollection", features:[] } });
      map.addLayer({
        id:"district-labels", type:"symbol", source:"labels",
        minzoom:7.5,
        layout:{
          "text-field":["get","district"],
          "text-size":10,
          "text-font":["Open Sans Regular"],
          "text-anchor":"center",
        },
        paint:{
          "text-color":"#1e293b",
          "text-halo-color":"rgba(255,255,255,0.85)",
          "text-halo-width":1.5,
        },
      });

      // ── hover interactions ──────────────────────────────────────────────
      let hoveredId = null;
      map.on("mousemove","district-hover-fill", e => {
        if (!e.features.length) return;
        map.getCanvas().style.cursor = "pointer";
        const props = e.features[0].properties;
        setTooltip(props);
        setTooltipPos({ x:e.point.x, y:e.point.y });

        // Brighten hovered polygon
        if (hoveredId !== props.district) {
          hoveredId = props.district;
          map.setPaintProperty("district-hover-fill","fill-opacity",[
            "case",["==",["get","district"],hoveredId],0.15,0
          ]);
        }
      });
      map.on("mouseleave","district-hover-fill", () => {
        map.getCanvas().style.cursor = "";
        setTooltip(null);
        hoveredId = null;
        map.setPaintProperty("district-hover-fill","fill-opacity",0);
      });

      // ── click/tap: show tooltip first, fly on second tap (mobile-friendly) ──
      let lastTappedDistrict = null;
      map.on("click","district-hover-fill", e => {
        if (!e.features.length) return;
        const props = e.features[0].properties;
        const isMobile = window.innerWidth <= 860;

        if (isMobile) {
          // First tap: show tooltip. Second tap on same district: zoom in.
          setTooltip(props);
          setTooltipPos({ x:e.point.x, y:e.point.y });

          if (lastTappedDistrict === props.district) {
            map.flyTo({
              center:[parseFloat(props.lon), parseFloat(props.lat)],
              zoom:8.5, duration:900, essential:true,
            });
            lastTappedDistrict = null;
          } else {
            lastTappedDistrict = props.district;
          }
        } else {
          map.flyTo({
            center:[parseFloat(props.lon), parseFloat(props.lat)],
            zoom:8.5, duration:900, essential:true,
          });
        }
      });

      // Tap on empty map area dismisses tooltip (mobile)
      map.on("click", e => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["district-hover-fill"] });
        if (features.length === 0) {
          setTooltip(null);
          lastTappedDistrict = null;
        }
      });

      setMapReady(true);
      mapInstance.current = map;
    });

    return () => {
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, []);

  // Update data when districts or filter changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;
    const filteredNames = new Set(districts.map(d => d.district));
    const gj = buildGeoJSON(DISTRICTS, filteredNames);

    // Build wider glow polygons (1.8× radius)
    const glowGJ = {
      type:"FeatureCollection",
      features: DISTRICTS.filter(d => filteredNames.has(d.district)).map(d => {
        const R=0.65, steps=36;
        const coords = Array.from({length:steps+1},(_,i)=>{
          const a=(i/steps)*2*Math.PI;
          return [d.lon+R*Math.cos(a), d.lat+R*Math.sin(a)];
        });
        return { type:"Feature", properties:{ active:true, glow:RISK_GLOW[d.risk]||"rgba(0,0,0,0)" }, geometry:{ type:"Polygon", coordinates:[coords] } };
      }),
    };

    // Label points
    const labelGJ = {
      type:"FeatureCollection",
      features: DISTRICTS.map(d => ({
        type:"Feature",
        properties:{ district:d.district },
        geometry:{ type:"Point", coordinates:[d.lon, d.lat] },
      })),
    };

    map.getSource("districts")?.setData(gj);
    map.getSource("districts-glow")?.setData(glowGJ);
    map.getSource("labels")?.setData(labelGJ);
  }, [districts, mapReady]);

  // Zoom to zone on sidebar filter
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady || !activeZone || activeZone === "All zones") {
      // Reset to Maharashtra view
      if (map && mapReady) {
        map.flyTo({ center:[76.8, 18.8], zoom: window.innerWidth <= 860 ? 5.5 : 6.2, duration:800 });
      }
      return;
    }
    const bounds = ZONE_BOUNDS[activeZone];
    if (!bounds) return;
    map.fitBounds(bounds, { padding:60, duration:900, essential:true });
  }, [activeZone, mapReady]);

  const riskCounts = {};
  districts.forEach(d => { riskCounts[d.risk] = (riskCounts[d.risk]||0)+1; });

  return (
    <div className="map-area" style={{position:"relative",overflow:"hidden",background:"#e8eef5"}}>
      <div ref={mapRef} id="map" style={{width:"100%",height:"100%"}} />

      {/* Top label */}
      <div className="map-label" style={{position:"absolute",top:10,left:12,zIndex:2}}>
        Maharashtra — 2026 kharif stress forecast
      </div>

      {/* Risk legend — top right, clear of bottom edge entirely */}
      <div style={{
        position:"absolute",
        top:12, right:12, zIndex:5,
        background:"rgba(255,255,255,0.97)",
        border:"0.5px solid var(--color-border)",
        borderRadius:8,padding:"8px 12px",
        display:"flex",flexDirection:"column",gap:4,
        boxShadow:"0 2px 10px rgba(0,0,0,0.08)",
      }}>
        {["Critical","High","Moderate","Low"].map(r => (
          <div key={r} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
            <div style={{
              width:12,height:12,borderRadius:3,
              background:RISK_COLORS[r],
              boxShadow:`0 0 6px ${RISK_COLORS[r]}55`,
            }}/>
            <span style={{color:"var(--color-text-secondary)",minWidth:58}}>{r}</span>
            <span style={{
              fontSize:10,fontWeight:500,
              background:RISK_COLORS[r]+"18",
              color:RISK_COLORS[r],
              borderRadius:10,padding:"1px 6px",
              border:`0.5px solid ${RISK_COLORS[r]}44`,
            }}>{riskCounts[r]||0}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position:"absolute",
          left: window.innerWidth <= 860
            ? Math.min(Math.max(tooltipPos.x - 86, 10), window.innerWidth - 190)
            : (tooltipPos.x > 700 ? tooltipPos.x - 200 : tooltipPos.x + 16),
          top: window.innerWidth <= 860
            ? Math.max(tooltipPos.y - 130, 60)
            : tooltipPos.y - 100,
          zIndex:10, pointerEvents:"none",
          background:"#ffffff",
          border:`1.5px solid ${RISK_COLORS[tooltip.risk]||"#e2e8f0"}`,
          borderRadius:10,padding:"10px 13px",minWidth:172,
          boxShadow:`0 4px 20px ${RISK_COLORS[tooltip.risk]||"#00000020"}22`,
        }}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--color-text-primary)",marginBottom:5}}>
            {tooltip.district}
          </div>
          <div style={{
            display:"inline-block",
            background:RISK_COLORS[tooltip.risk]+"18",
            color:RISK_COLORS[tooltip.risk],
            border:`0.5px solid ${RISK_COLORS[tooltip.risk]}55`,
            borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:600,marginBottom:8,
          }}>{tooltip.risk} risk</div>

          {/* Probability bar */}
          <div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:"var(--color-text-muted)",marginBottom:3}}>Risk probability</div>
            <div style={{display:"flex",height:6,borderRadius:3,overflow:"hidden",gap:1}}>
              {["prob_low","prob_moderate","prob_high","prob_critical"].map((k,i) => {
                const cols=["#16a34a","#ca8a04","#ea580c","#dc2626"];
                const v = parseFloat(tooltip[k])||0;
                return v > 0.01 ? <div key={k} style={{width:`${v*100}%`,background:cols[i],borderRadius:3}}/> : null;
              })}
            </div>
          </div>

          {[
            ["Rainfall deficit", `${Number(tooltip.deficit).toFixed(1)}%`],
            ["Crop",             tooltip.crop],
            ["Zone",             tooltip.zone],
            ["Drought history",  `${Math.round(Number(tooltip.drought_freq)*100)}% of years`],
            ["Stress score",     Number(tooltip.score).toFixed(3)],
          ].map(([k,v]) => (
            <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"var(--color-text-muted)",marginBottom:3}}>
              <span>{k}</span><b style={{color:"var(--color-text-secondary)"}}>{v}</b>
            </div>
          ))}
          <div style={{fontSize:10,color:"var(--color-text-muted)",marginTop:6,borderTop:"0.5px solid #f1f5f9",paddingTop:5}}>
            Click district to zoom in
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{
        position:"absolute",
        bottom: window.innerWidth <= 860 ? "calc(40vh + 64px)" : 14,
        left:"50%",transform:"translateX(-50%)",
        background:"rgba(255,255,255,.95)",border:"0.5px solid var(--color-border)",
        borderRadius:20,padding:"5px 16px",
        fontSize:11,color:"var(--color-text-muted)",
        display:"flex",alignItems:"center",gap:8,zIndex:2,
        whiteSpace:"nowrap",
      }}>
        <span style={{color:"var(--color-accent)"}}>●</span>
        {window.innerWidth <= 860 ? "Tap districts to inspect" : "2026 forecast · hover to inspect · click to zoom"}
      </div>
    </div>
  );
}
