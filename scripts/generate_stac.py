import os
import re
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
import pystac
import rasterio

BUCKET_NAME = "gmw-mvp-datalake-project-proproot"
BASE_URL = f"https://storage.googleapis.com/{BUCKET_NAME}/"

def get_bucket_keys():
    """Fetch all objects in the public GCS bucket using the XML API."""
    print(f"Scanning bucket: {BUCKET_NAME}...")
    response = requests.get(BASE_URL)
    response.raise_for_status()
    
    # Remove XML namespace to simplify searching (supports single or double quotes)
    xml_data = re.sub(r' xmlns=[\'"][^\'"]+[\'"]', '', response.text)
    root = ET.fromstring(xml_data)
    
    keys = [elem.text for elem in root.findall('.//Key')]
    return keys

def main():
    keys = get_bucket_keys()
    
    # 1. Create Catalog
    catalog = pystac.Catalog(
        id="gmw-v4-catalog",
        description="Global Mangrove Watch Version 4 - Spatial Assets",
        title="GMW v4 STAC Catalog"
    )
    
    # 2. Create Mangrove Extent Collection
    extent_collection = pystac.Collection(
        id="mangrove-extent",
        title="Mangrove Extent v4 (1985-2025)",
        description="Global Mangrove Watch Version 4 Extent COGs. Annual timeseries covering 1985 - 2025 at a 30m resolution.",
        extent=pystac.Extent(
            spatial=pystac.SpatialExtent([[-180.0, -90.0, 180.0, 90.0]]), # Will be updated dynamically
            temporal=pystac.TemporalExtent([[datetime(1985, 1, 1, tzinfo=timezone.utc), datetime(2025, 12, 31, tzinfo=timezone.utc)]])
        )
    )
    catalog.add_child(extent_collection)

    # 3. Process COGs
    print("Processing COGs dynamically via rasterio...")
    spatial_extents = []
    min_date = None
    max_date = None

    for key in keys:
        if key.startswith('cogs/') and key.endswith('.tif'):
            print(f"  Found COG: {key}")
            
            # Extract year from filename (e.g. gmw_mng_ext_1985_cog.tif)
            year_match = re.search(r'ext_(\d{4})_cog', key)
            if not year_match:
                continue
            year = int(year_match.group(1))
            
            date = datetime(year, 1, 1, tzinfo=timezone.utc)
            if not min_date or date < min_date: min_date = date
            if not max_date or date > max_date: max_date = date

            asset_url = BASE_URL + key
            vsi_url = f"/vsicurl/{asset_url}"
            
            try:
                with rasterio.open(vsi_url) as src:
                    bbox = list(src.bounds)
                    spatial_extents.append(bbox)
            except Exception as e:
                print(f"  [ERROR] Failed to read {key} with rasterio: {e}")
                continue

            item = pystac.Item(
                id=f"mangrove-extent-{year}",
                geometry={
                    "type": "Polygon",
                    "coordinates": [[
                        [bbox[0], bbox[1]],
                        [bbox[2], bbox[1]],
                        [bbox[2], bbox[3]],
                        [bbox[0], bbox[3]],
                        [bbox[0], bbox[1]]
                    ]]
                },
                bbox=bbox,
                datetime=date,
                properties={}
            )
            
            item.add_asset(
                key="data",
                asset=pystac.Asset(
                    href=asset_url,
                    media_type=pystac.MediaType.COG,
                    roles=["data"]
                )
            )
            extent_collection.add_item(item)

    # Update Collection Extent based on dynamic data
    if spatial_extents:
        global_bbox = [
            min(b[0] for b in spatial_extents),
            min(b[1] for b in spatial_extents),
            max(b[2] for b in spatial_extents),
            max(b[3] for b in spatial_extents)
        ]
        extent_collection.extent.spatial = pystac.SpatialExtent([global_bbox])
        extent_collection.extent.temporal = pystac.TemporalExtent([[min_date, max_date]])

    # 4. Create Mangrove Alerts Collection via DuckDB
    import duckdb
    print("Processing Alerts Parquet via DuckDB...")
    try:
        duckdb.execute("INSTALL httpfs; LOAD httpfs;")
        parquet_url = BASE_URL + "parquets/gmw-alerts-latest.parquet"
        res = duckdb.execute(f"SELECT MIN(first_obs_date), MAX(first_obs_date) FROM read_parquet('{parquet_url}')").fetchone()
        
        min_alert_date = datetime.strptime(str(res[0])[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        max_alert_date = datetime.strptime(str(res[1])[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        
        alerts_collection = pystac.Collection(
            id="mangrove-alerts",
            title="Mangrove Loss Alerts Database",
            description="Global Mangrove Watch Loss Alerts. Cloud-native Parquet and PMTiles containing all recorded loss alerts.",
            extent=pystac.Extent(
                spatial=pystac.SpatialExtent([[-180.0, -40.0, 180.0, 40.0]]),
                temporal=pystac.TemporalExtent([[min_alert_date, max_alert_date]])
            )
        )
        
        alerts_item = pystac.Item(
            id="mangrove-alerts-latest",
            geometry={
                "type": "Polygon",
                "coordinates": [[
                    [-180.0, -40.0],
                    [180.0, -40.0],
                    [180.0, 40.0],
                    [-180.0, 40.0],
                    [-180.0, -40.0]
                ]]
            },
            bbox=[-180.0, -40.0, 180.0, 40.0],
            datetime=max_alert_date,
            properties={
                "start_datetime": min_alert_date.isoformat(),
                "end_datetime": max_alert_date.isoformat()
            }
        )
        
        alerts_item.add_asset(
            key="parquet",
            asset=pystac.Asset(
                href=parquet_url,
                media_type="application/vnd.apache.parquet",
                roles=["data"]
            )
        )
        
        pmtiles_url = BASE_URL + "pmtiles/gmw-alerts-latest.pmtiles"
        alerts_item.add_asset(
            key="pmtiles",
            asset=pystac.Asset(
                href=pmtiles_url,
                media_type="application/vnd.pmtiles",
                roles=["visual"]
            )
        )
        
        alerts_collection.add_item(alerts_item)
        catalog.add_child(alerts_collection)
    except Exception as e:
        print(f"Failed to process alerts with duckdb: {e}")

    # 5. Save Catalog
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'stac')
    print(f"\nSaving STAC Catalog to {output_dir}")
    catalog.normalize_hrefs(output_dir)
    catalog.save(catalog_type=pystac.CatalogType.SELF_CONTAINED)
    print("Done! You can now upload the 'stac' folder to your GCS bucket.")

if __name__ == '__main__':
    main()
