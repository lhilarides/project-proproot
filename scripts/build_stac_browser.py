import os
import shutil
import subprocess
import re
from pathlib import Path

def main():
    repo_url = "https://github.com/radiantearth/stac-browser.git"
    src_dir = Path("stac-browser-src")
    public_dir = Path("public/explorer")
    
    print("Starting STAC Browser build process...")
    
    # 1. Clone the repository if it doesn't exist
    if not src_dir.exists():
        print(f"Cloning STAC Browser from {repo_url}...")
        subprocess.run(["git", "clone", repo_url, str(src_dir)], check=True)
    else:
        print("STAC Browser source already exists. Pulling latest changes...")
        subprocess.run(["git", "pull"], cwd=src_dir, check=True)
        
    # 2. Modify config.js
    config_path = src_dir / "config.js"
    print("Customizing config.js...")
    
    with open(config_path, "r", encoding="utf-8") as f:
        config_content = f.read()
        
    my_catalog_url = "https://storage.googleapis.com/gmw-mvp-datalake-project-proproot/stac/catalog.json"
    
    config_content = re.sub(r"catalogUrl:\s*null", f"catalogUrl: '{my_catalog_url}'", config_content)
    config_content = re.sub(r"catalogUrl:\s*['\"].*?['\"]", f"catalogUrl: '{my_catalog_url}'", config_content)
    config_content = re.sub(r"catalogTitle:\s*['\"].*?['\"]", "catalogTitle: 'Global Mangrove Watch STAC'", config_content)
    config_content = re.sub(r"historyMode:\s*['\"]history['\"]", "historyMode: 'hash'", config_content)
    config_content = re.sub(r"pathPrefix:\s*['\"].*?['\"]", "pathPrefix: '/explorer/'", config_content)
    
    theme_replacement = """theme: {
        primary: '#0F7B4E',
        secondary: '#1A2E3B',
    }"""
    config_content = re.sub(r"theme:\s*\{[^}]+\}", theme_replacement, config_content)
    
    with open(config_path, "w", encoding="utf-8") as f:
        f.write(config_content)
        
    print("Configuration updated.")
    
    # 3. Install dependencies and build
    print("Installing npm dependencies (this might take a minute)...")
    subprocess.run("npm install", cwd=src_dir, shell=True, check=True)
    
    print("Building the STAC Browser...")
    subprocess.run("npm run build", cwd=src_dir, shell=True, check=True)
    
    # 4. Copy to public/explorer
    print(f"Copying built files to {public_dir}...")
    if public_dir.exists():
        shutil.rmtree(public_dir)
        
    dist_dir = src_dir / "dist"
    shutil.copytree(dist_dir, public_dir)
    
    gitignore_path = Path(".gitignore")
    if gitignore_path.exists():
        with open(gitignore_path, "a+") as f:
            f.seek(0)
            if "stac-browser-src" not in f.read():
                f.write("\n# STAC Browser\nstac-browser-src/\n")
                
    print("Done! The STAC Browser is now available in public/explorer.")

if __name__ == "__main__":
    main()
