import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import MapComponent from './components/Map';
import DashboardPanel from './components/DashboardPanel';
import CountrySearch from './components/CountrySearch';
import { fetchStacExtentMetadata } from './services/stac';
import type { StacYearData } from './services/stac';
import './index.css';

function App() {
  const [layers, setLayers] = useState({
    extent: true,
    boundaries: true,
    alerts: false // default to off since it's 1M points, user can toggle it
  });
  
  const [year, setYear] = useState(1985);
  const [basemap, setBasemap] = useState('voyager');
  const [stacYears, setStacYears] = useState<StacYearData[]>([]);

  useEffect(() => {
    fetchStacExtentMetadata().then(data => {
      setStacYears(data);
    });
  }, []);

  const minYear = stacYears.length > 0 ? stacYears[0].year : 1985;
  const maxYear = stacYears.length > 0 ? stacYears[stacYears.length - 1].year : 2025;

  const toggleLayer = (layer: keyof typeof layers) => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  return (
    <HashRouter>
      <div className="app-container" style={{ position: 'relative' }}>
        <aside className="sidebar">
          {/* Replaced Text Branding with User's Context Logo! */}
          <div className="brand" style={{ marginBottom: '32px', paddingRight: '8px' }}>
            <img src="/logo-white.svg" alt="Global Mangrove Watch" style={{ height: '40px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
          </div>

          <CountrySearch />

          <Routes>
            <Route path="/" element={<DashboardPanel />} />
            <Route path="/country/:iso" element={<DashboardPanel />} />
          </Routes>

          <div className="panel-section">
            <h2>Basemap</h2>
            <div className="basemap-selector">
              {['voyager', 'satellite'].map((b) => (
                <button 
                  key={b}
                  className={`basemap-btn ${basemap === b ? 'active' : ''}`}
                  onClick={() => setBasemap(b)}
                >
                  {b === 'voyager' ? 'Carto Voyager' : 'ESRI Satellite'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="panel-section">
            <h2>Timeline</h2>
            <div className="timeline-container" style={{ position: 'relative', marginTop: '24px', paddingBottom: '20px' }}>
              <div 
                className="timeline-knob-tooltip" 
                style={{ 
                  left: `calc(${maxYear === minYear ? 0 : ((year - minYear) / (maxYear - minYear)) * 100}% + 8px - ${maxYear === minYear ? 0 : ((year - minYear) / (maxYear - minYear)) * 16}px)` 
                }}
              >
                {year}
              </div>
              <input 
                type="range" 
                min={minYear} 
                max={maxYear} 
                value={year} 
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="timeline-slider"
              />
              <div className="timeline-ticks">
                {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(y => {
                  if (y % 5 === 0 || y === minYear || y === maxYear) {
                    return (
                      <div key={y} className="timeline-tick" style={{ left: `${maxYear === minYear ? 0 : ((y - minYear) / (maxYear - minYear)) * 100}%` }}>
                        <span className="tick-label">{y}</span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>

          <div className="panel-section">
            <h2>Data Layers</h2>
            
            <div 
              className={`layer-toggle ${layers.extent ? 'active' : ''}`}
              onClick={() => toggleLayer('extent')}
            >
              <div className="layer-info">
                <span className="layer-name">Mangrove Extent</span>
                <span className="layer-desc">Cloud Optimized GeoTIFF ({year})</span>
              </div>
              <div className="toggle-switch"></div>
            </div>

            <div 
              className={`layer-toggle ${layers.boundaries ? 'active' : ''}`}
              onClick={() => toggleLayer('boundaries')}
            >
              <div className="layer-info">
                <span className="layer-name">Country Boundaries</span>
                <span className="layer-desc">PMTiles Vector Data</span>
              </div>
              <div className="toggle-switch"></div>
            </div>

            <div 
              className={`layer-toggle ${layers.alerts ? 'active' : ''}`}
              onClick={() => toggleLayer('alerts')}
            >
              <div className="layer-info">
                <span className="layer-name">Mangrove Alerts</span>
                <span className="layer-desc">Recent Loss Events (1M points)</span>
              </div>
              <div className="toggle-switch"></div>
            </div>
          </div>
        </aside>

        <main className="map-view">
          {/* We must pass 'activeLayers' as activeLayers prop instead of 'layers' since we renamed it */}
          {/* Adding key={basemap} forces React to cleanly remount MapLibre, preserving layers because Map.tsx restores from URL hash! */}
          <MapComponent key={basemap} activeLayers={layers} year={year} basemap={basemap} stacYears={stacYears} />
        </main>
      </div>
    </HashRouter>
  );
}

export default App;
