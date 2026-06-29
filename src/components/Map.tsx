import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import DrawControls from './DrawControls';
import PwaBadge from './PwaBadge';

const BUCKET_NAME = 'gmw-mvp-datalake-project-proproot';
const TITILER_URL = 'https://titiler-576283594732.us-central1.run.app';

function lon2tile(lon: number, zoom: number) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
function lat2tile(lat: number, zoom: number) { return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); }

function getTilesForBBox(minLng: number, minLat: number, maxLng: number, maxLat: number, minZoom: number, maxZoom: number) {
  const tiles = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    let minX = Math.max(0, lon2tile(minLng, z));
    let maxX = Math.min(Math.pow(2, z) - 1, lon2tile(maxLng, z));
    let minY = Math.max(0, lat2tile(maxLat, z)); // maxLat is North, which is smaller Y
    let maxY = Math.min(Math.pow(2, z) - 1, lat2tile(minLat, z));
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({x, y, z});
      }
    }
  }
  return tiles;
}

const BASEMAPS: Record<string, any> = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256
      }
    },
    layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }]
  },
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256
      }
    },
    layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite' }]
  }
};

import type { StacYearData } from '../services/stac';

interface MapProps {
  activeLayers: {
    extent: boolean;
    boundaries: boolean;
    alerts: boolean;
  };
  year: number;
  basemap: string;
  stacYears: StacYearData[];
}


export default function MapComponent({ activeLayers, year, basemap, stacYears }: MapProps) {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'ready' | 'error'>('idle');

  const handleTakeOffline = async () => {
    try {
      setDownloadState('downloading');
      
      // 1. Fetch PMTiles for Boundaries so the Service Worker catches and caches them
      const pmtilesRes = await fetch('https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/pmtiles/gmw_openstreetmap_country_boundaries_20250320.pmtiles');
      await pmtilesRes.blob();
      
      // 2. Fetch PMTiles for Alerts
      const alertsPmtilesRes = await fetch('https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/pmtiles/gmw-alerts-latest.pmtiles');
      await alertsPmtilesRes.blob();

      // 3. Seed TiTiler Raster Tiles for the current viewport (up to zoom 10)
      if (map.current) {
        const bounds = map.current.getBounds();
        const tiles = getTilesForBBox(bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(), 0, 10);
        
        if (tiles.length > 3000) {
          alert(`Viewport is too large (${tiles.length} tiles). Please zoom in to take raster layers offline.`);
          setDownloadState('error');
          return;
        }

        let cogUrl = `https://storage.googleapis.com/${BUCKET_NAME}/cogs/gmw_mng_ext_${year}_cog.tif`;
        if (stacYears && stacYears.length > 0) {
          const match = stacYears.find(sy => sy.year === year);
          if (match) cogUrl = match.assetUrl;
        }

        // Fetch tiles in chunks to prevent browser connection exhaustion
        const chunkSize = 20;
        for (let i = 0; i < tiles.length; i += chunkSize) {
          const chunk = tiles.slice(i, i + chunkSize);
          await Promise.all(chunk.map(async t => {
            const url = `${TITILER_URL}/cog/tiles/WebMercatorQuad/${t.z}/${t.x}/${t.y}?url=${cogUrl}&bidx=1&rescale=0,1&colormap_name=greens&unscale=true`;
            try {
              const res = await fetch(url);
              if (res.ok) await res.blob();
            } catch (e) {
              // Ignore individual tile errors (e.g. empty ocean areas)
            }
          }));
        }
      }
      
      setDownloadState('ready');
    } catch (e) {
      console.error('Failed to take offline:', e);
      setDownloadState('error');
    }
  };

  // Initial map setup
  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    try {
      let protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
    } catch (e) {
      // Ignore if already registered
    }

    // Manually parse URL hash to prevent MapLibre's built-in hash from wiping the URL on unmount
    let initialCenter: [number, number] = [0, 20];
    let initialZoom = 2.5;
    
    if (window.location.hash) {
      const parts = window.location.hash.replace('#', '').split('/');
      if (parts.length >= 3) {
        initialZoom = parseFloat(parts[0]);
        initialCenter = [parseFloat(parts[2]), parseFloat(parts[1])];
      }
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAPS[basemap] || BASEMAPS['dark'],
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false
    });

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    map.current.on('moveend', () => {
      if (!map.current) return;
      const center = map.current.getCenter();
      const zoom = map.current.getZoom();
      window.history.replaceState(null, '', `#${zoom.toFixed(2)}/${center.lat.toFixed(4)}/${center.lng.toFixed(4)}`);
    });

    map.current.on('load', () => {
      map.current?.resize(); // Force resize to ensure canvas isn't 0x0
      setMapLoaded(true);
    });

    // Catch any source loading errors so they don't freeze the entire map rendering
    map.current.on('error', (e) => {
      console.warn("MapLibre Error:", e.error?.message || e);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Handle Vector Layer (Boundaries)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const sourceId = 'boundaries-source';
    const layerId = 'boundaries-layer';

    if (activeLayers.boundaries && !map.current.getSource(sourceId)) {
      // Pointing to the new pmtiles directory and the specific country boundaries file
      const pmtilesUrl = `https://storage.googleapis.com/${BUCKET_NAME}/pmtiles/gmw_openstreetmap_country_boundaries_20250320.pmtiles`; 
      
      map.current.addSource(sourceId, {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        maxzoom: 6
      });

      map.current.addLayer({
        id: 'boundaries-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': 'gmw_openstreetmap_country_boundaries_20250320',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0 // Keep invisible normally, hover states could be added here later
        }
      });

      map.current.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        'source-layer': 'gmw_openstreetmap_country_boundaries_20250320',
        paint: {
          'line-color': '#10b981', 
          'line-width': 1.5,
          'line-opacity': 0.8
        }
      });

      // Interactivity
      map.current.on('mouseenter', 'boundaries-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'boundaries-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

      map.current.on('click', 'boundaries-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const iso = e.features[0].properties.iso3cd;
          if (iso) navigate(`/country/${iso}`);
        }
      });
    }

    if (map.current.getLayer(layerId)) {
      const visibility = activeLayers.boundaries ? 'visible' : 'none';
      map.current.setLayoutProperty(layerId, 'visibility', visibility);
      map.current.setLayoutProperty('boundaries-fill', 'visibility', visibility);
    }
  }, [mapLoaded, activeLayers.boundaries, navigate]);

  // Handle Alerts Layer
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const sourceId = 'alerts-source';
    const layerId = 'alerts-layer';

    if (!map.current.getSource(sourceId)) {
      const pmtilesUrl = `https://storage.googleapis.com/${BUCKET_NAME}/pmtiles/gmw-alerts-latest.pmtiles`;
      
      map.current.addSource(sourceId, {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`
      });

      map.current.addLayer({
        id: layerId,
        type: 'circle',
        source: sourceId,
        'source-layer': 'gmw-alerts-latest',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            2, 1.5,
            8, 3,
            14, 6
          ],
          'circle-color': [
            'case',
            ['>=', ['get', 'first_obs_date'], '2024'], '#ef4444', // Bright Red (2024+)
            ['>=', ['get', 'first_obs_date'], '2022'], '#f97316', // Orange (2022-2023)
            '#fef08a' // Pale Yellow (2020-2021)
          ],
          'circle-opacity': 0.8,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': 'rgba(0,0,0,0.5)'
        }
      });
      
      // Setup hover interactions if desired
      map.current.on('mouseenter', layerId, () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', layerId, () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
      
      // Popup with date on click
      map.current.on('click', layerId, (e) => {
        if (!map.current || !e.features || e.features.length === 0) return;
        const coords = e.lngLat;
        const date = e.features[0].properties.first_obs_date;
        new maplibregl.Popup()
          .setLngLat(coords)
          .setHTML(`<div style="padding:4px;color:#0f172a"><b>Alert Date:</b> ${date}</div>`)
          .addTo(map.current);
      });
    }

    if (map.current.getLayer(layerId)) {
      map.current.setLayoutProperty(layerId, 'visibility', activeLayers.alerts ? 'visible' : 'none');
    }
  }, [mapLoaded, activeLayers.alerts]);

  // Handle Raster Layer (Extent with Dynamic Year)
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const sourceId = 'mangrove-extent';
    const layerId = 'mangrove-extent-layer';

    if (map.current.getSource(sourceId)) {
      map.current.removeLayer(layerId);
      map.current.removeSource(sourceId);
    }

    if (activeLayers.extent) {
      let cogUrl = `https://storage.googleapis.com/${BUCKET_NAME}/cogs/gmw_mng_ext_${year}_cog.tif`; // Fallback
      if (stacYears && stacYears.length > 0) {
        const match = stacYears.find(sy => sy.year === year);
        if (match) cogUrl = match.assetUrl;
      }

      const titilerTileUrl = `${TITILER_URL}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=${cogUrl}&bidx=1&rescale=0,1&colormap_name=greens&unscale=true`;

      map.current.addSource(sourceId, {
        type: 'raster',
        tiles: [titilerTileUrl],
        tileSize: 256,
        bounds: [-180, -40, 180, 40], // Prevent MapLibre from requesting non-tropical tiles (stops 404 spam)
        maxzoom: 12 // Prevent oversampling requests; MapLibre will stretch Z12 tiles for deeper zooms
      });

      const beforeId = map.current.getLayer('boundaries-layer') ? 'boundaries-layer' : undefined;

      map.current.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': 0.8,
          'raster-fade-duration': 300 
        }
      }, beforeId);
    }

  }, [mapLoaded, year, activeLayers.extent]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }} />
      {mapLoaded && <DrawControls map={map.current} year={year} />}
      
      {/* Offline Management UI */}
      <div style={{ position: 'absolute', bottom: 16, right: 10, zIndex: 10 }}>
        <button 
          onClick={handleTakeOffline} 
          disabled={downloadState === 'downloading' || downloadState === 'ready'}
          style={{ 
            background: downloadState === 'ready' ? '#10b981' : 'rgba(15, 23, 42, 0.9)', 
            color: 'white', 
            border: '1px solid rgba(255,255,255,0.1)', 
            backdropFilter: 'blur(10px)',
            padding: '10px 16px', 
            borderRadius: '8px', 
            cursor: 'pointer',
            opacity: downloadState === 'downloading' ? 0.7 : 1,
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontSize: '0.8rem'
          }}
        >
          {downloadState === 'idle' && 'Cache Area Offline'}
          {downloadState === 'downloading' && 'Caching Tiles...'}
          {downloadState === 'ready' && 'Area Saved Offline'}
          {downloadState === 'error' && 'Failed to Cache'}
        </button>
      </div>

      <PwaBadge />
    </div>
  );
}
