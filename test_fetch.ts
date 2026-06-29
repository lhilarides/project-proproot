

const ROOT_URL = 'https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/stac/catalog.json';

async function test() {
    try {
        const catalogRes = await fetch(ROOT_URL, { cache: 'no-cache' });
        const catalog = await catalogRes.json();

        const extentLink = catalog.links.find((l: any) => l.rel === 'child' && l.href.includes('mangrove-extent'));
        const collectionUrl = new URL(extentLink.href, ROOT_URL).href;
        
        const collectionRes = await fetch(collectionUrl, { cache: 'no-cache' });
        const collection = await collectionRes.json();

        const itemLinks = collection.links.filter((l: any) => l.rel === 'item');
        console.log(`Found ${itemLinks.length} items`);
        
        const results = [];
        for (const link of itemLinks) {
            const itemUrl = new URL(link.href, collectionUrl).href;
            console.log("Fetching item:", itemUrl);
            const itemRes = await fetch(itemUrl, { cache: 'no-cache' });
            const item = await itemRes.json();
            if (item.properties && item.properties.datetime) {
                const year = new Date(item.properties.datetime).getUTCFullYear();
                const dataAsset = item.assets?.data;
                if (dataAsset) {
                    const assetUrl = new URL(dataAsset.href, itemUrl).href;
                    results.push({ year, assetUrl });
                }
            }
        }
        console.log("Results:", results);
    } catch (e) {
        console.error(e);
    }
}
test();
