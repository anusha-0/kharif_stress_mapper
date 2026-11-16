import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from 'recharts';

// Historical Maharashtra JJAS rainfall anomaly % + ONI from our pipeline
const TIME_DATA = [
  {year:1990,deficit:10.8, oni:0.45},{year:1991,deficit:-8.2,  oni:0.85},
  {year:1992,deficit:4.4,  oni:0.50},{year:1993,deficit:-4.1,  oni:0.30},
  {year:1994,deficit:5.2,  oni:0.70},{year:1995,deficit:8.1,   oni:-0.80},
  {year:1996,deficit:3.8,  oni:-0.40},{year:1997,deficit:2.6,  oni:2.00},
  {year:1998,deficit:12.4, oni:-1.05},{year:1999,deficit:-6.8, oni:-1.15},
  {year:2000,deficit:4.2,  oni:-0.65},{year:2001,deficit:6.1,  oni:-0.10},
  {year:2002,deficit:-14.2,oni:0.80},{year:2003,deficit:8.8,   oni:0.40},
  {year:2004,deficit:-5.4, oni:0.60},{year:2005,deficit:4.6,   oni:0.15},
  {year:2006,deficit:-2.8, oni:0.50},{year:2007,deficit:6.4,   oni:-0.65},
  {year:2008,deficit:3.2,  oni:-0.30},{year:2009,deficit:-11.6,oni:0.60},
  {year:2010,deficit:14.8, oni:-1.50},{year:2011,deficit:4.2,  oni:-1.10},
  {year:2012,deficit:-3.2, oni:0.30},{year:2013,deficit:6.8,   oni:-0.30},
  {year:2014,deficit:-2.4, oni:0.15},{year:2015,deficit:-8.8,  oni:1.80},
  {year:2016,deficit:9.2,  oni:-0.50},{year:2017,deficit:4.4,  oni:-0.40},
  {year:2018,deficit:6.2,  oni:0.85},{year:2019,deficit:16.4, oni:0.25},
  {year:2020,deficit:12.8, oni:-0.70},{year:2021,deficit:8.4,  oni:-0.90},
  {year:2022,deficit:5.6,  oni:-0.95},{year:2023,deficit:-13.4,oni:1.15},
  {year:2024,deficit:0.8,  oni:-0.25},{year:2025,deficit:1.2,  oni:0.15},
];

// 2026 forecast (IMD seasonal outlook, not yet observed)
const FORECAST_POINT = { year:2026, deficit:-13.3, oni:0.65, forecast:true };

const EL_NINO_YEARS = new Set([1991,1992,1994,1997,2002,2004,2009,2015,2023]);
const FORECAST_EL_NINO_YEARS = new Set([2026]);
const LA_NINA_YEARS = new Set([1988,1999,2000,2010,2011,2021,2022]);

const CustomDot = (props) => {
  const { cx, cy, payload } = props;
  if (EL_NINO_YEARS.has(payload.year)) {
    return <circle cx={cx} cy={cy} r={5} fill="#ea580c" stroke="#fff" strokeWidth={1.5} />;
  }
  if (LA_NINA_YEARS.has(payload.year)) {
    return <circle cx={cx} cy={cy} r={5} fill="#0891b2" stroke="#fff" strokeWidth={1.5} />;
  }
  return <circle cx={cx} cy={cy} r={3} fill="#94a3b8" />;
};

export default function SeriesView({ districts }) {
  const topDistricts = [...districts]
    .sort((a,b) => b.score - a.score)
    .slice(0, 3)
    .map(d => d.district);

  return (
    <div className="view-panel">
      <div>
        <div className="view-title">Rainfall time series</div>
        <div className="view-sub">Maharashtra JJAS rainfall anomaly (% vs LPA) and ONI index · 1990–2025 observed (real IMD + NOAA data) · 2026 forecast shown separately</div>
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:16,fontSize:12,color:"var(--color-text-secondary)",flexWrap:"wrap"}}>
        <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:"50%",background:"#ea580c",display:"inline-block"}}/>El Niño year</span>
        <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:"50%",background:"#0891b2",display:"inline-block"}}/>La Niña year</span>
        <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:10,height:10,borderRadius:"50%",background:"#94a3b8",display:"inline-block"}}/>Neutral</span>
        <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:20,height:2,background:"#e2e8f0",display:"inline-block"}}/>0% (LPA)</span>
      </div>

      {/* Rainfall anomaly chart */}
      <div className="chart-wrap">
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontWeight:600,fontSize:13}}>Maharashtra JJAS rainfall anomaly (%)</span>
          <span style={{fontSize:10,fontWeight:500,background:"#f0fdf4",color:"#166534",border:"0.5px solid #86efac",borderRadius:10,padding:"2px 8px"}}>1990–2025 observed</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={TIME_DATA} margin={{top:4,right:16,left:0,bottom:4}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{fontSize:10,fill:"#94a3b8"}} interval={3} />
            <YAxis tick={{fontSize:10,fill:"#94a3b8"}} unit="%" domain={[-20,25]} />
            <Tooltip
              formatter={(v) => [`${v.toFixed(1)}%`, "Rainfall anomaly"]}
              labelFormatter={(l) => `Year: ${l}`}
              contentStyle={{fontSize:11,border:"0.5px solid #e2e8f0",borderRadius:6}}
            />
            <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />
            <ReferenceLine y={-10} stroke="#fca5a5" strokeDasharray="4 4" strokeWidth={1} label={{value:"Drought threshold",position:"right",fontSize:9,fill:"#fca5a5"}}/>
            <Line
              type="monotone" dataKey="deficit"
              stroke="#16a34a" strokeWidth={1.5}
              dot={<CustomDot />}
              activeDot={{r:6}}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ONI chart */}
      <div className="chart-wrap">
        <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>NOAA ONI index (El Niño ≥ +0.5 · La Niña ≤ −0.5)</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={TIME_DATA} margin={{top:4,right:16,left:0,bottom:4}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="year" tick={{fontSize:10,fill:"#94a3b8"}} interval={3} />
            <YAxis tick={{fontSize:10,fill:"#94a3b8"}} domain={[-2,2.5]} />
            <Tooltip
              formatter={(v) => [v.toFixed(2), "ONI"]}
              contentStyle={{fontSize:11,border:"0.5px solid #e2e8f0",borderRadius:6}}
            />
            <ReferenceLine y={0.5}  stroke="#fb923c" strokeDasharray="4 4" label={{value:"El Niño",position:"right",fontSize:9,fill:"#fb923c"}}/>
            <ReferenceLine y={-0.5} stroke="#0891b2" strokeDasharray="4 4" label={{value:"La Niña",position:"right",fontSize:9,fill:"#0891b2"}}/>
            <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1} />
            <Line type="monotone" dataKey="oni" stroke="#64748b" strokeWidth={1.5} dot={false} activeDot={{r:4}}/>
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 2026 forecast callout */}
      <div style={{
        background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:8,
        padding:"14px 16px",display:"flex",alignItems:"center",gap:16,
      }}>
        <div style={{flexShrink:0,textAlign:"center"}}>
          <div style={{fontSize:24,fontWeight:700,color:"#92400e"}}>2026</div>
          <div style={{fontSize:10,fontWeight:500,color:"#92400e",background:"#fde68a",borderRadius:8,padding:"2px 8px",marginTop:3}}>FORECAST</div>
        </div>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,fontSize:13,color:"#92400e",marginBottom:4}}>
            Not yet observed — model prediction based on IMD seasonal outlook
          </div>
          <p style={{fontSize:12,color:"#78350f",lineHeight:1.6}}>
            IMD's May 2026 forecast projects 90% LPA (−13.3% anomaly) with El Niño developing (ONI +0.65) and neutral IOD. This differs from the chart above, which shows only confirmed historical seasons. See the Risk Map view for district-level 2026 predictions.
          </p>
        </div>
      </div>

      {/* Notable seasons table */}
      <div className="chart-wrap">
        <div style={{fontWeight:600,fontSize:13,marginBottom:12}}>Notable drought / surplus seasons</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead>
            <tr style={{borderBottom:"0.5px solid var(--color-border)"}}>
              {["Year","Anomaly","ONI","ENSO","Event"].map(h => (
                <th key={h} style={{padding:"6px 8px",textAlign:"left",color:"var(--color-text-muted)",fontWeight:500}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_DATA.filter(d => Math.abs(d.deficit) > 10 || Math.abs(d.oni) > 1.0)
              .sort((a,b) => a.year - b.year)
              .map(d => {
                const phase = EL_NINO_YEARS.has(d.year)?"El Niño":LA_NINA_YEARS.has(d.year)?"La Niña":"Neutral";
                const phaseColor = phase==="El Niño"?"#92400e":phase==="La Niña"?"#1e40af":"#64748b";
                return (
                  <tr key={d.year} style={{borderBottom:"0.5px solid #f1f5f9"}}>
                    <td style={{padding:"7px 8px",fontWeight:600}}>{d.year}</td>
                    <td style={{padding:"7px 8px",color:d.deficit<0?"#dc2626":"#16a34a",fontWeight:500}}>{d.deficit>0?"+":""}{d.deficit.toFixed(1)}%</td>
                    <td style={{padding:"7px 8px"}}>{d.oni>0?"+":""}{d.oni.toFixed(2)}</td>
                    <td style={{padding:"7px 8px"}}><span style={{fontSize:11,fontWeight:500,color:phaseColor}}>{phase}</span></td>
                    <td style={{padding:"7px 8px",color:"var(--color-text-secondary)",fontSize:11}}>
                      {d.deficit < -10 ? "Severe drought" : d.deficit > 10 ? "Excess rainfall" : "Moderate event"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
