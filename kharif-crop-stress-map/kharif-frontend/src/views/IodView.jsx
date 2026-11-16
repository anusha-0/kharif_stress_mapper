import { ENSO_IOD_TABLE } from '../data/districtData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const KEY_YEARS = [
  { year:1997, oni:2.00, dmi:0.72, enso:"El Niño",  iod:"Positive", outcome:"Near-normal monsoon despite strongest El Niño of century. IOD offset confirmed.", tag:"IOD buffered" },
  { year:2002, oni:0.80, dmi:-0.30, enso:"El Niño", iod:"Negative", outcome:"Severe drought across Maharashtra. El Niño amplified by negative IOD — worst combination.", tag:"Worst combo" },
  { year:2009, oni:0.60, dmi:-0.10, enso:"El Niño", iod:"Neutral",  outcome:"Below-normal monsoon. El Niño effect with no IOD buffer.", tag:"No buffer" },
  { year:2019, oni:0.25, dmi:0.85,  enso:"Neutral", iod:"Positive", outcome:"Record-breaking positive IOD drove excellent monsoon despite weak El Niño.", tag:"IOD driven" },
  { year:2023, oni:1.15, dmi:-0.25, enso:"El Niño", iod:"Negative", outcome:"Below-normal monsoon. El Niño + negative IOD — no protective buffer from IOD.", tag:"High risk" },
];

const TAG_COLORS = {
  "IOD buffered": { bg:"#f0fdf4", text:"#166534", border:"#86efac" },
  "Worst combo":  { bg:"#fee2e2", text:"#991b1b", border:"#fca5a5" },
  "No buffer":    { bg:"#ffedd5", text:"#9a3412", border:"#fdba74" },
  "IOD driven":   { bg:"#eff6ff", text:"#1e40af", border:"#bfdbfe" },
  "High risk":    { bg:"#fee2e2", text:"#991b1b", border:"#fca5a5" },
};

export default function IodView() {
  const chartData = ENSO_IOD_TABLE.map(r => ({
    name: `${r.enso.replace("El Niño","ElN").replace("La Niña","LaN")} + ${r.iod.replace(" IOD","").replace("Negative","Neg").replace("Positive","Pos")}`,
    stress: r.stress,
    deficit: Math.abs(r.deficit),
    color: r.color,
    label: `${r.enso} · ${r.iod}`,
  }));

  return (
    <div className="view-panel">
      <div>
        <div className="view-title">IOD × ENSO interaction</div>
        <div className="view-sub">How the Indian Ocean Dipole modifies El Niño's impact on Maharashtra's kharif season</div>
      </div>

      {/* Key finding */}
      <div style={{background:"#f0fdf4",border:"0.5px solid #86efac",borderRadius:8,padding:"14px 16px"}}>
        <div style={{fontWeight:600,fontSize:13,color:"#166534",marginBottom:6}}>Key finding from real IMD + NOAA data</div>
        <p style={{fontSize:12,color:"#14532d",lineHeight:1.7}}>
          El Niño + negative IOD produces the highest drought stress (0.663), while a positive IOD during El Niño partially offsets the damage (0.562) — a 15% reduction in stress. The IOD offset effect is most clearly demonstrated in 1997 (strongest El Niño of the 20th century, yet near-normal monsoon due to positive IOD = +0.72) and 2019 (record positive IOD drove excellent monsoon with minimal ENSO forcing).
        </p>
      </div>

      {/* Stress bar chart */}
      <div className="chart-wrap">
        <div style={{fontWeight:600,fontSize:13,marginBottom:16}}>Composite stress score by ENSO × IOD phase</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{top:0,right:16,left:0,bottom:40}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="name"
              tick={{fontSize:10,fill:"#94a3b8"}}
              angle={-30} textAnchor="end" interval={0}
            />
            <YAxis domain={[0,0.8]} tick={{fontSize:10,fill:"#94a3b8"}} />
            <Tooltip
              formatter={(v,n,p) => [v.toFixed(3), p.payload.label]}
              contentStyle={{fontSize:11,border:"0.5px solid #e2e8f0",borderRadius:6}}
            />
            <Bar dataKey="stress" radius={[4,4,0,0]}>
              {chartData.map((d,i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Key year cards */}
      <div>
        <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Key historical events</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {KEY_YEARS.map(yr => {
            const tc = TAG_COLORS[yr.tag];
            return (
              <div key={yr.year} style={{
                background:"var(--color-surface)",
                border:"0.5px solid var(--color-border)",
                borderRadius:8, padding:"12px 14px",
                display:"flex", gap:14, alignItems:"flex-start"
              }}>
                <div style={{flexShrink:0,textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:700,color:"var(--color-text-primary)"}}>{yr.year}</div>
                  <div style={{fontSize:10,color:"var(--color-text-muted)"}}>ONI {yr.oni > 0 ? "+":""}{yr.oni}</div>
                  <div style={{fontSize:10,color:"var(--color-text-muted)"}}>DMI {yr.dmi > 0 ? "+":""}{yr.dmi}</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,fontWeight:500,background:yr.enso==="El Niño"?"#fef3c7":"#eff6ff",color:yr.enso==="El Niño"?"#92400e":"#1e40af",border:`0.5px solid ${yr.enso==="El Niño"?"#fcd34d":"#bfdbfe"}`,borderRadius:4,padding:"2px 7px"}}>{yr.enso}</span>
                    <span style={{fontSize:11,fontWeight:500,background:yr.iod==="Positive"?"#f0fdf4":yr.iod==="Negative"?"#fee2e2":"#f8fafc",color:yr.iod==="Positive"?"#166534":yr.iod==="Negative"?"#991b1b":"#64748b",border:`0.5px solid ${yr.iod==="Positive"?"#86efac":yr.iod==="Negative"?"#fca5a5":"#e2e8f0"}`,borderRadius:4,padding:"2px 7px"}}>IOD {yr.iod}</span>
                    <span style={{fontSize:11,fontWeight:500,background:tc.bg,color:tc.text,border:`0.5px solid ${tc.border}`,borderRadius:4,padding:"2px 7px"}}>{yr.tag}</span>
                  </div>
                  <p style={{fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.6}}>{yr.outcome}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
