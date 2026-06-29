import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
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
import { getCountryBBox } from '../services/DuckDBService';

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

function getInsertBeforeId(map: maplibregl.Map | null, currentLayerType: 'extent' | 'boundaries' | 'alerts') {
  if (!map) return undefined;
  
  // Define strict ordering (from lowest to highest)
  const orderedLayers = [
    'mangrove-extent-layer-glow',
    'mangrove-extent-layer',
    'boundaries-fill',
    'boundaries-layer',
    'alerts-layer'
  ];

  let startIndex = 0;
  if (currentLayerType === 'extent') startIndex = 2; // Look for boundaries or above
  else if (currentLayerType === 'boundaries') startIndex = 4; // Look for alerts or above
  else if (currentLayerType === 'alerts') startIndex = 5; // Look for symbols/draw

  // 1. Check if any higher specific layers exist
  for (let i = startIndex; i < orderedLayers.length; i++) {
    if (map.getLayer(orderedLayers[i])) return orderedLayers[i];
  }

  const layers = map.getStyle().layers || [];
  
  // 2. First, always try to place underneath user-drawn TerraDraw layers
  const drawLayer = layers.find(l => l.id.startsWith('td-') || l.id.includes('terradraw') || l.id.includes('draw'));
  if (drawLayer) return drawLayer.id;
  
  // 3. Otherwise, try to place underneath text labels (symbol layers) so maps look beautiful
  const symbolLayer = layers.find(l => l.type === 'symbol');
  if (symbolLayer) return symbolLayer.id;
  
  return undefined;
}


export default function MapComponent({ activeLayers, year, basemap, stacYears }: MapProps) {
  const navigate = useNavigate();
  const location = useLocation();
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

    // Parse URL hash to prevent MapLibre's built-in hash from wiping the URL on unmount
    let initialCenter: [number, number] = [0, 20];
    let initialZoom = 2.5;
    
    const hashStr = window.location.hash;
    const searchParams = new URLSearchParams(hashStr.split('?')[1] || '');
    
    if (searchParams.has('z') && searchParams.has('lat') && searchParams.has('lng')) {
      initialZoom = parseFloat(searchParams.get('z')!);
      initialCenter = [parseFloat(searchParams.get('lng')!), parseFloat(searchParams.get('lat')!)];
    } else {
      // Fallback for old hash format (e.g. #5/1.2/3.4)
      const oldParts = hashStr.replace('#', '').split('/');
      if (oldParts.length >= 3 && !isNaN(parseFloat(oldParts[0]))) {
         initialZoom = parseFloat(oldParts[0]);
         initialCenter = [parseFloat(oldParts[2]), parseFloat(oldParts[1])];
      }
    }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAPS[basemap] || BASEMAPS['voyager'],
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false
    });

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    map.current.on('moveend', () => {
      if (!map.current) return;
      const center = map.current.getCenter();
      const zoom = map.current.getZoom();
      
      const currentHash = window.location.hash || '#/';
      const pathOnly = currentHash.split('?')[0];
      
      window.history.replaceState(null, '', `${pathOnly}?z=${zoom.toFixed(2)}&lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}`);
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

  // Zoom to country based on URL
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    const match = location.pathname.match(/^\/country\/([a-zA-Z]{3})$/i);
    if (match && match[1]) {
      const iso = match[1].toUpperCase();
      getCountryBBox(iso).then(bbox => {
        if (bbox && map.current) {
          map.current.fitBounds(bbox, { padding: 50, duration: 1000 });
        }
      });
    }
  }, [location.pathname, mapLoaded]);

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

      const beforeId = getInsertBeforeId(map.current, 'boundaries');

      map.current.addLayer({
        id: 'boundaries-fill',
        type: 'fill',
        source: sourceId,
        'source-layer': 'gmw_openstreetmap_country_boundaries_20250320',
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0 // Keep invisible normally, hover states could be added here later
        }
      }, beforeId);

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
      }, beforeId);

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

      const beforeId = getInsertBeforeId(map.current, 'alerts');

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
      }, beforeId);
      
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
      if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
      if (map.current.getLayer(layerId + '-glow')) map.current.removeLayer(layerId + '-glow');
      map.current.removeSource(sourceId);
    }

    if (activeLayers.extent) {
      let cogUrl = `https://storage.googleapis.com/${BUCKET_NAME}/cogs/gmw_mng_ext_${year}_cog.tif`; // Fallback
      if (stacYears && stacYears.length > 0) {
        const match = stacYears.find(sy => sy.year === year);
        if (match) cogUrl = match.assetUrl;
      }

      // Use a custom colormap mapping value '1' to Teal (#06c4bd)
      const colormap = '%7B%221%22%3A%22%2306c4bdff%22%7D';
      
      // resampling_method=max ensures that 30m pixels don't disappear at global zoom levels!
      const titilerTileUrl = `${TITILER_URL}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url=${cogUrl}&bidx=1&colormap=${colormap}&unscale=true&resampling_method=max`;

      map.current.addSource(sourceId, {
        type: 'raster',
        tiles: [titilerTileUrl],
        tileSize: 256,
        bounds: [-180, -40, 180, 40], // Prevent MapLibre from requesting non-tropical tiles (stops 404 spam)
        maxzoom: 12 // Prevent oversampling requests; MapLibre will stretch Z12 tiles for deeper zooms
      });

      const beforeId = getInsertBeforeId(map.current, 'extent');

      // Glow layer (soft, stretched representation)
      map.current.addLayer({
        id: layerId + '-glow',
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': 0.5,
          'raster-resampling': 'linear',
          'raster-fade-duration': 300 
        }
      }, beforeId);

      // Core crisp layer
      map.current.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': 1.0,
          'raster-resampling': 'nearest',
          'raster-fade-duration': 300 
        }
      }, beforeId);
    }

  }, [mapLoaded, year, activeLayers.extent]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }} />
      {mapLoaded && (
        <DrawControls 
          map={map.current} 
          year={year} 
          onCacheOffline={handleTakeOffline} 
          downloadState={downloadState} 
          stacYears={stacYears}
        />
      )}
      
      <PwaBadge />
    </div>
  );
}
