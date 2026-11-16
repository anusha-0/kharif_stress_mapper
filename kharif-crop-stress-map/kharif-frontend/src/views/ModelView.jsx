import { CV_RESULTS, FEATURE_IMPORTANCE } from '../data/districtData';

const maxGain = FEATURE_IMPORTANCE[0].gain;

const CONFUSION = [
  { actual:"Low",      pred_low:448, pred_mod:0,  pred_high:0,  pred_crit:0  },
  { actual:"Moderate", pred_low:0,   pred_mod:405, pred_high:0,  pred_crit:0  },
  { actual:"High",     pred_low:0,   pred_mod:12,  pred_high:129, pred_crit:2  },
  { actual:"Critical", pred_low:0,   pred_mod:0,   pred_high:6,  pred_crit:150 },
];

const RISK_LABELS = ["Low","Moderate","High","Critical"];

export default function ModelView() {
  return (
    <div className="view-panel">
      <div>
        <div className="view-title">Model insights</div>
        <div className="view-sub">XGBoost classifier · leave-one-zone-out spatial cross-validation · 29 features · 1,088 training rows</div>
      </div>

      {/* CV metric cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {[
          { label:"Spatial CV accuracy",   val:`${(CV_RESULTS.accuracy*100).toFixed(1)}%`, sub:`± ${(CV_RESULTS.accuracy_std*100).toFixed(1)}%`, color:"#16a34a" },
          { label:"F1-weighted",           val:`${(CV_RESULTS.f1_weighted*100).toFixed(1)}%`, sub:`± ${(CV_RESULTS.f1_weighted_std*100).toFixed(1)}%`, color:"#0891b2" },
          { label:"F1-macro",              val:`${(CV_RESULTS.f1_macro*100).toFixed(1)}%`, sub:`± ${(CV_RESULTS.f1_macro_std*100).toFixed(1)}%`, color:"#7c3aed" },
        ].map(m => (
          <div className="info-card" key={m.label} style={{textAlign:"center"}}>
            <div style={{fontSize:24,fontWeight:600,color:m.color}}>{m.val}</div>
            <div style={{fontSize:11,color:"var(--color-text-muted)",margin:"2px 0 4px"}}>{m.sub}</div>
            <div style={{fontSize:12,color:"var(--color-text-secondary)",fontWeight:500}}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Per-fold results */}
      <div className="chart-wrap">
        <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Per-zone CV results</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{borderBottom:"0.5px solid var(--color-border)"}}>
                <th style={{padding:"6px 12px",textAlign:"left",color:"var(--color-text-muted)",fontWeight:500}}>Zone (held out)</th>
                <th style={{padding:"6px 12px",textAlign:"right",color:"var(--color-text-muted)",fontWeight:500}}>Accuracy</th>
                <th style={{padding:"6px 12px",textAlign:"right",color:"var(--color-text-muted)",fontWeight:500}}>F1-weighted</th>
                <th style={{padding:"6px 12px",textAlign:"right",color:"var(--color-text-muted)",fontWeight:500}}>F1-macro</th>
              </tr>
            </thead>
            <tbody>
              {CV_RESULTS.folds.map(f => (
                <tr key={f.zone} style={{borderBottom:"0.5px solid #f1f5f9"}}>
                  <td style={{padding:"8px 12px",fontWeight:500}}>{f.zone}</td>
                  <td style={{padding:"8px 12px",textAlign:"right",color: f.acc >= 0.95 ? "#16a34a" : f.acc >= 0.90 ? "#d97706" : "#dc2626"}}>
                    {(f.acc*100).toFixed(1)}%
                  </td>
                  <td style={{padding:"8px 12px",textAlign:"right"}}>{(f.f1w*100).toFixed(1)}%</td>
                  <td style={{padding:"8px 12px",textAlign:"right"}}>{(f.f1m*100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature importance */}
      <div className="chart-wrap">
        <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Feature importance (XGBoost gain)</div>
        {FEATURE_IMPORTANCE.map((f,i) => (
          <div key={f.name} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12}}>
            <span style={{width:16,fontSize:11,color:"var(--color-text-muted)",textAlign:"right",marginTop:2}}>{i+1}</span>
            <div style={{width:230,flexShrink:0}}>
              <div style={{fontSize:12,color:"var(--color-text-primary)",fontWeight:500}}>{f.label}</div>
              <div style={{fontSize:10,color:"var(--color-text-muted)",fontFamily:"monospace",marginTop:1}}>{f.name}</div>
            </div>
            <div style={{flex:1,marginTop:4}}>
              <div style={{height:8,background:"#f1f5f9",borderRadius:2,overflow:"hidden",marginBottom:4}}>
                <div style={{width:`${(f.gain/maxGain)*100}%`,height:"100%",background:"#16a34a",borderRadius:2}} />
              </div>
              <div style={{fontSize:10,color:"var(--color-text-muted)",lineHeight:1.4}}>{f.desc}</div>
            </div>
            <span style={{width:32,fontSize:11,color:"var(--color-text-muted)",textAlign:"right",marginTop:2,flexShrink:0}}>{f.gain}</span>
          </div>
        ))}
      </div>

      {/* Why spatial CV matters */}
      <div className="info-card" style={{borderLeft:"3px solid #7c3aed",borderRadius:"0 8px 8px 0"}}>
        <h3 style={{color:"#7c3aed",marginBottom:8}}>Why spatial cross-validation?</h3>
        <p>Standard k-fold CV randomly splits districts into train/test folds. Because adjacent districts share climate patterns (El Niño affects entire Marathwada simultaneously), leaked spatial autocorrelation inflates accuracy by 8–15%. Leave-one-zone-out CV holds out entire agro-ecological zones, giving an honest estimate of how the model generalises to unseen geographic regions.</p>
      </div>
    </div>
  );
}
