import { FEATURE_IMPORTANCE, ENSO_IOD_TABLE } from '../data/districtData';

const WAVE = [7,9,13,18,22,28,32,26,20,15,10,7];
const WAVE_COLORS = ["#e2e8f0","#e2e8f0","#fde68a","#fcd34d","#fb923c","#f87171",
                     "#dc2626","#f87171","#fb923c","#fde68a","#e2e8f0","#e2e8f0"];
const maxGain = FEATURE_IMPORTANCE[0].gain;

export default function RightPanel({ districts }) {
  const critical = districts.filter(d => d.risk === "Critical").length;
  const high     = districts.filter(d => d.risk === "High").length;
  const avgDef   = districts.length
    ? (districts.reduce((s, d) => s + d.deficit, 0) / districts.length).toFixed(1)
    : 0;
  const worst = [...districts].sort((a,b) => b.score - a.score)[0];

  return (
    <div className="rpanel">
      <div>
        <div className="rp-title">Season at a glance</div>
        <div className="rp-sub">2026 forecast · El Niño + neutral IOD</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className={`stat-val ${critical > 0 ? "red" : "green"}`}>{critical + high}</div>
          <div className="stat-lbl">High / critical districts</div>
        </div>
        <div className="stat-card">
          <div className="stat-val amber">{avgDef}%</div>
          <div className="stat-lbl">Avg rainfall deficit</div>
        </div>
        <div className="stat-card">
          <div className="stat-val green">92.7%</div>
          <div className="stat-lbl">Model accuracy (spatial CV)</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{fontSize:14}}>{worst?.district ?? "—"}</div>
          <div className="stat-lbl">Most stressed district</div>
        </div>
      </div>

      {/* ENSO × IOD signal */}
      <div>
        <div className="rp-title" style={{marginBottom:7}}>ENSO × IOD — 2026 signal</div>
        <div className="panel-box">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{fontSize:10,color:"var(--color-text-muted)"}}>Jun–Sep composite</span>
            <div className="enso-pills">
              <span className="ep iod">El Niño +0.65</span>
              <span className="ep iod">IOD +0.10</span>
            </div>
          </div>
          <div className="wave-row">
            {WAVE.map((h,i) => (
              <div key={i} className="wave-bar" style={{height:h,background:WAVE_COLORS[i]}} />
            ))}
          </div>
          <div className="wave-labels">
            <span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span>
          </div>
        </div>
      </div>

      {/* Feature importance */}
      <div>
        <div className="rp-title" style={{marginBottom:7}}>Top feature importance</div>
        {FEATURE_IMPORTANCE.slice(0,7).map((f,i) => (
          <div className="fi-row" key={f.name} title={f.desc}>
            <span className="fi-rank">{i+1}</span>
            <span className="fi-name">{f.label}</span>
            <div className="fi-track">
              <div className="fi-fill" style={{width:`${(f.gain/maxGain)*100}%`}} />
            </div>
            <span className="fi-val">{f.gain}</span>
          </div>
        ))}
        <div style={{fontSize:9,color:"var(--color-text-muted)",marginTop:4,fontStyle:"italic"}}>
          Hover any feature for explanation
        </div>
      </div>

      {/* IOD offset chart */}
      <div className="panel-box">
        <div className="rp-title" style={{marginBottom:8}}>IOD offset effect (real data)</div>
        {ENSO_IOD_TABLE.map(row => (
          <div className="cbar-row" key={row.enso+row.iod}>
            <span className="cbar-label">{row.enso} · {row.iod.replace(" IOD","")}</span>
            <div className="cbar-track">
              <div className="cbar-fill" style={{
                width:`${(row.stress/0.663)*100}%`,
                background:row.color
              }} />
            </div>
            <span className="cbar-val" style={{color:row.color}}>{row.stress}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
