import { ZONES, CROPS } from '../data/districtData';

const NAV = [
  { id:"map",    icon:"ti-map-2",     label:"Risk map"       },
  { id:"series", icon:"ti-chart-line", label:"Time series"   },
  { id:"model",  icon:"ti-brain",      label:"Model insights" },
  { id:"iod",    icon:"ti-cloud-rain", label:"IOD × ENSO"    },
];

const RISK_COLORS = { Critical:"#dc2626", High:"#ea580c", Moderate:"#ca8a04", Low:"#16a34a" };

export default function Sidebar({ view, setView, zone, setZone, crop, setCrop, districts }) {
  const zoneCounts = {}, cropCounts = {}, riskCounts = {};
  districts.forEach(d => {
    const z = d.zone || d.agro_zone;
    const c = d.crop || d.dominant_kharif_crop;
    if (z) zoneCounts[z] = (zoneCounts[z]||0)+1;
    if (c) cropCounts[c] = (cropCounts[c]||0)+1;
    if (d.risk || d.ml_risk_label) {
      const r = d.risk || d.ml_risk_label;
      riskCounts[r] = (riskCounts[r]||0)+1;
    }
  });

  return (
    <div className="sidebar">
      <div className="s-section">Views</div>
      {NAV.map(n => (
        <div key={n.id} className={`s-item ${view===n.id?"active":""}`} onClick={()=>setView(n.id)}>
          <i className={`ti ${n.icon}`} aria-hidden="true"/>
          {n.label}
        </div>
      ))}

      <div className="s-divider"/>
      <div className="s-section">Filter by zone</div>
      <div className="filter-block">
        {ZONES.map(z => {
          const isAll = z==="All zones";
          const count = isAll ? districts.length : (zoneCounts[z]||0);
          const sel   = zone===z;
          return (
            <button key={z} className={`filter-btn ${sel?"sel":""}`}
              onClick={()=>setZone(z)}
              style={{ transition:"all 0.18s ease" }}>
              {z}<span className="ct">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="s-divider"/>
      <div className="s-section">Filter by crop</div>
      <div className="filter-block">
        {CROPS.map(c => {
          const isAll = c==="All crops";
          const count = isAll ? districts.length : (cropCounts[c]||0);
          const sel   = crop===c;
          return (
            <button key={c} className={`filter-btn ${sel?"sel":""}`}
              onClick={()=>setCrop(c)}
              style={{ transition:"all 0.18s ease" }}>
              {c}<span className="ct">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Risk breakdown — live counts */}
      <div className="s-divider"/>
      <div className="s-section">Risk breakdown</div>
      <div style={{padding:"4px 14px"}}>
        {["Critical","High","Moderate","Low"].map(r => {
          const n = riskCounts[r]||0;
          const pct = districts.length ? (n/districts.length)*100 : 0;
          return (
            <div key={r} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                <span style={{color:RISK_COLORS[r],fontWeight:500}}>{r}</span>
                <span style={{color:"var(--color-text-muted)"}}>{n} districts</span>
              </div>
              <div style={{height:5,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                <div style={{
                  width:`${pct}%`,height:"100%",
                  background:RISK_COLORS[r],borderRadius:3,
                  transition:"width 0.4s ease",
                }}/>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sidebar-legend" style={{marginTop:"auto"}}>
        <div className="s-section" style={{padding:"0 0 6px"}}>
          2026 · El Niño forecast
        </div>
        <div style={{fontSize:11,color:"var(--color-text-muted)",lineHeight:1.6}}>
          IMD seasonal forecast: 90% LPA · El Niño developing · neutral IOD
        </div>
      </div>
    </div>
  );
}
