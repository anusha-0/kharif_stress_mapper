import { useState, useMemo, useEffect } from 'react';
import './index.css';
import { DISTRICTS } from './data/districtData';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import MapView from './components/MapView';
import ModelView from './views/ModelView';
import IodView from './views/IodView';
import SeriesView from './views/SeriesView';

const NAV = [
  { id:"map",    icon:"ti-map-2",      label:"Map"    },
  { id:"series", icon:"ti-chart-line", label:"Trends" },
  { id:"model",  icon:"ti-brain",      label:"Model"  },
  { id:"iod",    icon:"ti-cloud-rain", label:"IOD"    },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 860 : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 860);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

export default function App() {
  const [view, setView]           = useState("map");
  const [zone, setZone]           = useState("All zones");
  const [crop, setCrop]           = useState("All crops");
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const isMobile = useIsMobile();

  const filteredDistricts = useMemo(() => {
    return DISTRICTS.filter(d => {
      const dZone = d.zone || d.agro_zone || "";
      const dCrop = d.crop || d.dominant_kharif_crop || "";
      const zoneMatch = zone === "All zones" || dZone === zone;
      const cropMatch = crop === "All crops" || dCrop === crop;
      return zoneMatch && cropMatch;
    });
  }, [zone, crop]);

  // Close drawer whenever a view is selected on mobile
  const handleSetView = (v) => {
    setView(v);
    setDrawerOpen(false);
  };

  return (
    <div className={`app-shell ${isMobile ? "is-mobile" : ""}`}>
      <header className="topbar">
        {isMobile && (
          <button className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <i className="ti ti-menu-2" aria-hidden="true" />
          </button>
        )}
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <span className="topbar-logo">Varsha</span>
          {!isMobile && (
            <span style={{
              fontSize:10.5,fontWeight:500,color:"var(--color-text-secondary)",
              letterSpacing:"0.02em",
              borderLeft:"1px solid var(--color-border-strong)",
              paddingLeft:9,
            }}>Kharif Drought Intelligence</span>
          )}
        </div>
        <div className="year-pill">
          <span className="yr-dot" />
          <b>2026</b> forecast
        </div>
        {!isMobile && <span className="tbadge amber">El Niño + Neutral IOD</span>}
        <span className="topbar-sep" />
        {!isMobile && <span style={{fontSize:11,color:"var(--color-text-muted)"}}>Maharashtra · 36 districts</span>}
      </header>

      {/* Sidebar — fixed column on desktop, slide-out drawer on mobile */}
      {(!isMobile || drawerOpen) && (
        <>
          {isMobile && <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />}
          <div className={isMobile ? "drawer-panel" : ""}>
            {isMobile && (
              <div className="drawer-header">
                <span className="topbar-logo" style={{fontSize:16}}>Varsha</span>
                <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              </div>
            )}
            <Sidebar
              view={view} setView={handleSetView}
              zone={zone} setZone={setZone}
              crop={crop} setCrop={setCrop}
              districts={filteredDistricts}
            />
          </div>
        </>
      )}

      {view === "map"    && <MapView districts={filteredDistricts} activeZone={zone} />}
      {view === "series" && <SeriesView districts={filteredDistricts} />}
      {view === "model"  && <ModelView />}
      {view === "iod"    && <IodView />}

      {/* Right panel — fixed column on desktop, bottom sheet on mobile */}
      {isMobile ? (
        <div className={`bottom-sheet ${sheetExpanded ? "expanded" : ""}`}>
          <div className="sheet-handle" onClick={() => setSheetExpanded(v => !v)}>
            <div className="sheet-grip" />
            <span style={{fontSize:11,color:"var(--color-text-muted)"}}>
              {sheetExpanded ? "Swipe down to collapse" : "Swipe up for season details"}
            </span>
          </div>
          <div className="sheet-body">
            <RightPanel districts={filteredDistricts} />
          </div>
        </div>
      ) : (
        <RightPanel districts={filteredDistricts} />
      )}

      {/* Bottom tab bar — mobile only */}
      {isMobile && (
        <nav className="bottom-tabbar">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`tab-btn ${view === n.id ? "active" : ""}`}
              onClick={() => handleSetView(n.id)}
            >
              <i className={`ti ${n.icon}`} aria-hidden="true" />
              <span>{n.label}</span>
            </button>
          ))}
          <button className="tab-btn" onClick={() => setDrawerOpen(true)}>
            <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
            <span>Filters</span>
          </button>
        </nav>
      )}
    </div>
  );
}
