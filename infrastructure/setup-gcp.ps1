param(
    [string]$ProjectID = "YOUR_PROJECT_ID",
    [string]$Region = "us-central1"
)

$BucketName = "gmw-mvp-datalake-$ProjectID"

Write-Host "Setting up Google Cloud infrastructure for project: $ProjectID"
gcloud config set project $ProjectID

Write-Host "1. Creating GCS Bucket for data lake ($BucketName)..."
# Create the bucket (uniform bucket level access)
gsutil mb -p $ProjectID -l $Region -b on "gs://$BucketName/"

# Make the bucket public so MapLibre and DuckDB can read files
gsutil iam ch allUsers:objectViewer "gs://$BucketName/"

Write-Host "2. Applying CORS configuration to the bucket..."
gsutil cors set "infrastructure\cors.json" "gs://$BucketName/"

Write-Host "3. Deploying TiTiler to Google Cloud Run..."
# We use the public TiTiler image to serve map tiles directly from our GCS COGs
gcloud run deploy titiler `
  --image ghcr.io/stac-utils/titiler:latest `
  --platform managed `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars="^:^CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif,.tiff,.vrt:TITILER_API_CORS_ALLOW_METHODS=*"

Write-Host "Setup Complete!"
Write-Host "Your bucket: gs://$BucketName"
