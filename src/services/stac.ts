const ROOT_URL = 'https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/stac/catalog.json';

export interface StacYearData {
  year: number;
  assetUrl: string;
}

/**
 * Fetches the STAC catalog and discovers all available Mangrove Extent years dynamically.
 */
export async function fetchStacExtentMetadata(): Promise<StacYearData[]> {
  try {
    const ts = new Date().getTime(); // Cache buster
    const catalogRes = await fetch(`${ROOT_URL}?t=${ts}`, { cache: 'no-cache' });
    if (!catalogRes.ok) throw new Error("STAC catalog not found");
    const catalog = await catalogRes.json();

    // Find the mangrove-extent collection link
    const extentLink = catalog.links.find((l: any) => l.rel === 'child' && l.href.includes('mangrove-extent'));
    if (!extentLink) throw new Error("Mangrove extent collection not found in STAC catalog");

    // Resolve absolute URL based on the catalog URL
    const collectionUrl = new URL(extentLink.href, ROOT_URL).href;
    const collectionRes = await fetch(`${collectionUrl}?t=${ts}`, { cache: 'no-cache' });
    const collection = await collectionRes.json();

    const results: StacYearData[] = [];
    
    // Find all items in the collection
    const itemLinks = collection.links.filter((l: any) => l.rel === 'item');
    
    // Fetch all items concurrently for speed
    await Promise.all(itemLinks.map(async (link: any) => {
      try {
        const itemUrl = new URL(link.href, collectionUrl).href;
        const itemRes = await fetch(`${itemUrl}?t=${ts}`, { cache: 'no-cache' });
        const item = await itemRes.json();
        
        // Extract year from the STAC item properties
        if (item.properties && item.properties.datetime) {
            const year = new Date(item.properties.datetime).getUTCFullYear();
            
            // Extract the asset URL
            const dataAsset = item.assets?.data;
            if (dataAsset) {
                const assetUrl = new URL(dataAsset.href, itemUrl).href;
                results.push({ year, assetUrl });
            }
        }
      } catch (err) {
        console.error("Failed to parse STAC item:", link.href, err);
      }
    }));

    if (results.length === 0) {
      throw new Error("STAC collection is empty or missing items. Please ensure STAC subfolders are uploaded to the bucket.");
    }

    // Return sorted chronologically
    return results.sort((a, b) => a.year - b.year);
  } catch (error) {
    console.error("Failed to fetch STAC metadata:", error);
    throw error;
  }
}
