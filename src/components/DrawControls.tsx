import { useEffect, useRef, useState } from 'react';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import maplibregl from 'maplibre-gl';
import { initDuckDB, queryParquet } from '../services/DuckDBService';
import { Database } from 'lucide-react';

interface DrawControlsProps {
  map: maplibregl.Map | null;
  year: number;
  onCacheOffline?: () => void;
  downloadState?: 'idle' | 'downloading' | 'ready' | 'error';
  stacYears?: { year: number; assetUrl: string }[];
}

export default function DrawControls({ map, year, onCacheOffline, downloadState = 'idle', stacYears = [] }: DrawControlsProps) {
  const drawRef = useRef<TerraDraw | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isRasterExtracting, setIsRasterExtracting] = useState(false);
  const [isAlertsExtracting, setIsAlertsExtracting] = useState(false);
  const [duckdbReady, setDuckdbReady] = useState(false);

  useEffect(() => {
    initDuckDB().then(() => setDuckdbReady(true)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!map || drawRef.current) return;

    // We must wait for the map to be styled before initializing TerraDraw
    const initDraw = () => {
      if (drawRef.current) return;

      drawRef.current = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawSelectMode({ flags: { polygon: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } } } }),
          new TerraDrawPolygonMode()
        ]
      });

      drawRef.current.start();

      drawRef.current.on('finish', () => {
        setHasPolygon(true);
        drawRef.current?.setMode('select');
        setIsDrawing(false);
      });
    };

    if (map.isStyleLoaded()) {
      initDraw();
    } else {
      map.on('style.load', initDraw);
    }

    return () => {
      if (drawRef.current) {
        try {
          drawRef.current.stop();
        } catch (e) {
          // Ignore adapter errors if the map is already being destroyed
        }
        drawRef.current = null;
      }
    };
  }, [map]);

  const startDrawing = (mode: 'polygon' | 'rectangle') => {
    if (!drawRef.current) return;
    drawRef.current.clear();
    setHasPolygon(false);
    drawRef.current.setMode(mode);
    setIsDrawing(true);
  };

  const clearDrawing = () => {
    if (!drawRef.current) return;
    drawRef.current.clear();
    drawRef.current.setMode('static');
    setHasPolygon(false);
    setIsDrawing(false);
  };

  const extractData = async () => {
    if (!drawRef.current || !duckdbReady) return;
    
    const snapshot = drawRef.current.getSnapshot();
    if (snapshot.length === 0) return;

    const feature = snapshot[0];
    
    // WKT generation for DuckDB
    const rings = feature.geometry.coordinates as number[][][];
    
    const wktRings = rings.map(ring => {
      return `(${ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ')})`;
    });
    
    const wkt = `POLYGON(${wktRings.join(', ')})`;

    setIsExtracting(true);
    try {
      const url = `https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/parquets/gmw_openstreetmap_country_boundaries_20250320_fixed.parquet`;
      const geojson = await queryParquet(wkt, url);
      
      const blob = new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'extracted_boundaries.geojson';
      link.click();
      
    } catch (error) {
      console.error(error);
      alert("Failed to extract data. Check console for details.");
    } finally {
      setIsExtracting(false);
    }
  };

  const extractAlerts = async () => {
    if (!drawRef.current) return;
    const snapshot = drawRef.current.getSnapshot();
    if (snapshot.length === 0) return;

    const feature = snapshot[0];
    const rings = feature.geometry.coordinates as number[][][];
    const wktCoords = rings[0].map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
    const wkt = `POLYGON((${wktCoords}))`;

    setIsAlertsExtracting(true);
    try {
      const url = `https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/parquets/gmw-alerts-latest.parquet`;
      const geojson = await queryParquet(wkt, url);
      
      const blob = new Blob([JSON.stringify(geojson)], { type: 'application/geo+json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'extracted_alerts.geojson';
      link.click();
      
    } catch (error) {
      console.error(error);
      alert("Failed to extract alerts. Check console for details.");
    } finally {
      setIsAlertsExtracting(false);
    }
  };

  const extractRaster = async () => {
    if (!drawRef.current) return;
    const snapshot = drawRef.current.getSnapshot();
    if (snapshot.length === 0) return;
    const feature = snapshot[0];
    
    // Feature geometry will be passed directly for clipping

    setIsRasterExtracting(true);
    try {
      let targetYear = year;
      let httpsRasterUrl = `https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/cogs/gmw_mng_ext_${year}_cog.tif`;
      
      if (stacYears && stacYears.length > 0) {
        const latest = stacYears.reduce((max, curr) => curr.year > max.year ? curr : max, stacYears[0]);
        targetYear = latest.year;
        httpsRasterUrl = latest.assetUrl;
      }

      // Feature extraction using POST to clip exactly to polygon
      const postUrl = `https://titiler-576283594732.us-central1.run.app/cog/feature.tif?url=${encodeURIComponent(httpsRasterUrl)}`;
      
      const response = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: "Feature",
          properties: {},
          geometry: feature.geometry
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to extract raster: ${errText}`);
      }
      
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `mangroves_extent_${targetYear}_crop.tif`;
      link.click();
    } catch(e) {
      console.error(e);
      alert("Failed to clip raster. Please try a smaller area or check the console.");
    } finally {
      setIsRasterExtracting(false);
    }
  };

  if (!map) return null;

  return (
    <div className="draw-controls" style={{ position: 'absolute', bottom: 30, right: 10, zIndex: 10, background: 'rgba(15, 23, 42, 0.9)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '220px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '1px' }}>Data Tools</h3>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <a
          href="/explorer/index.html"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
            textDecoration: 'none',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: '0.8rem',
            fontWeight: 500,
            transition: 'all 0.2s',
          }}
        >
          <Database size={14} /> Browse STAC Catalog
        </a>
        {onCacheOffline && (
          <button 
            onClick={onCacheOffline} 
            disabled={downloadState === 'downloading' || downloadState === 'ready'}
            style={{ 
              width: '100%', 
              background: downloadState === 'ready' ? '#10b981' : 'rgba(255,255,255,0.05)', 
              color: '#fff', 
              border: '1px solid rgba(255,255,255,0.1)', 
              padding: '8px 12px', 
              borderRadius: 8, 
              cursor: 'pointer', 
              fontSize: '0.8rem', 
              transition: 'all 0.2s', 
              fontWeight: 500,
              opacity: downloadState === 'downloading' ? 0.7 : 1
            }}
          >
            {downloadState === 'idle' && 'Cache Data'}
            {downloadState === 'downloading' && 'Caching Tiles...'}
            {downloadState === 'ready' && 'Data Cached'}
            {downloadState === 'error' && 'Failed to Cache'}
          </button>
        )}

        <button onClick={() => startDrawing('polygon')} style={{ width: '100%', background: isDrawing ? '#10b981' : 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s', fontWeight: 500 }}>
          {isDrawing ? 'Drawing...' : 'Extract Data'}
        </button>
      </div>

      {hasPolygon && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={extractData} disabled={!duckdbReady || isExtracting} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', flex: 1, fontWeight: 600, opacity: (!duckdbReady || isExtracting) ? 0.7 : 1 }}>
            {isExtracting ? 'Extracting Boundaries...' : (duckdbReady ? 'Download Boundaries (GeoJSON)' : 'Loading Engine...')}
          </button>
          
          <button onClick={extractAlerts} disabled={!duckdbReady || isAlertsExtracting} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', flex: 1, fontWeight: 600, opacity: (!duckdbReady || isAlertsExtracting) ? 0.7 : 1 }}>
            {isAlertsExtracting ? 'Extracting Alerts...' : (duckdbReady ? 'Download Alerts (GeoJSON)' : 'Loading Engine...')}
          </button>

          <button onClick={extractRaster} disabled={isRasterExtracting} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', flex: 1, fontWeight: 600, opacity: isRasterExtracting ? 0.7 : 1 }}>
            {isRasterExtracting ? 'Cropping Raster...' : 'Download Raster (GeoTIFF)'}
          </button>

          <button onClick={clearDrawing} style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem' }}>
            Clear Polygon
          </button>
        </div>
      )}
    </div>
  );
}
