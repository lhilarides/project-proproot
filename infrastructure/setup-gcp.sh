#!/bin/bash

# Global Mangrove Watch MVP: GCP Infrastructure Setup
# Usage: ./setup-gcp.sh <PROJECT_ID> [BUCKET_NAME] [REGION]

PROJECT_ID=${1:-"YOUR_PROJECT_ID"}
BUCKET_NAME=${2:-"gmw-mvp-datalake-${PROJECT_ID}"}
REGION=${3:-"us-central1"}

echo "Setting up Google Cloud infrastructure for project: $PROJECT_ID"
gcloud config set project $PROJECT_ID

echo "1. Creating GCS Bucket for data lake ($BUCKET_NAME)..."
# Create the bucket (uniform bucket level access)
gsutil mb -p $PROJECT_ID -l $REGION -b on gs://$BUCKET_NAME/

# Make the bucket public so MapLibre and DuckDB can read files
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME/

echo "2. Applying CORS configuration to the bucket..."
gsutil cors set cors.json gs://$BUCKET_NAME/

echo "3. Deploying TiTiler to Google Cloud Run..."
# We use the public TiTiler image to serve map tiles directly from our GCS COGs
gcloud run deploy titiler \
  --image ghcr.io/stac-utils/titiler:latest \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif,.tiff,.vrt"

echo "Setup Complete!"
echo "Your bucket: gs://$BUCKET_NAME"
