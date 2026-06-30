# ProQ Pilot Google Cloud Migration

This guide is for `D:\Websites\Github\ProQ Pilot` only. The StackOps project is a reference and must stay separate.

## What Is Separate

- Cloud Run service: `proq-pilot`
- Production domain: `https://proqpilot.com`
- Artifact Registry image: `us-central1-docker.pkg.dev/proq-pilot/proq-pilot-repo/proq-pilot`
- Runtime service account: `proq-pilot-run@proq-pilot.iam.gserviceaccount.com`
- Secret prefix: `PROQ_`
- Recommended Cloud SQL instance: `proq-pilot-db`
- Recommended database name: use a ProQ-only database, for example `proq_pilot` or your current imported schema name

Do not reuse StackOps private keys, JWT secrets, database users, Cloud Run services, Cloud Build triggers, or Secret Manager names.

## 1. Enable Google Cloud APIs

```bash
gcloud config set project proq-pilot

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com
```

## 2. Create Artifact Registry

Skip this if `proq-pilot-repo` already exists.

```bash
gcloud artifacts repositories create proq-pilot-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="Website containers"
```

## 3. Create ProQ Cloud Run Service Account

```bash
gcloud iam service-accounts create proq-pilot-run \
  --display-name="ProQ Pilot Cloud Run"
```

Grant it access to Cloud SQL and Secret Manager:

```bash
gcloud projects add-iam-policy-binding proq-pilot \
  --member="serviceAccount:proq-pilot-run@proq-pilot.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding proq-pilot \
  --member="serviceAccount:proq-pilot-run@proq-pilot.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## 4. Create Cloud SQL For ProQ

Best separation is a dedicated ProQ Cloud SQL instance:

```bash
gcloud sql instances create proq-pilot-db \
  --database-version=MYSQL_8_0 \
  --region=us-central1 \
  --tier=db-f1-micro
```

Create a ProQ-only database and user:

```bash
gcloud sql databases create proq_pilot \
  --instance=proq-pilot-db

gcloud sql users create proq_pilot_app \
  --instance=proq-pilot-db \
  --host=% \
  --password="REPLACE_WITH_STRONG_PASSWORD"
```

If you choose to use the existing Cloud SQL instance instead, still create a separate ProQ database and a separate ProQ DB user.

## 5. Import Your MySQL Data

Export your current local MySQL database, upload it to Cloud Storage, then import it into Cloud SQL.

```bash
gcloud storage buckets create gs://proq-pilot-db-imports-proq-pilot \
  --location=us-central1
```

From your local machine, create a SQL dump with your MySQL tools, upload it, then import:

```bash
gcloud storage cp proq-pilot.sql gs://proq-pilot-db-imports-proq-pilot/proq-pilot.sql

gcloud sql import sql proq-pilot-db \
  gs://proq-pilot-db-imports-proq-pilot/proq-pilot.sql \
  --database=proq_pilot
```

## 6. Create ProQ Secrets

These are the Secret Manager names used by `cloudbuild.yaml`. Cloud Run injects them into the environment variables that the Node.js code reads with `process.env`.

```bash
printf "proq_pilot_app" | gcloud secrets create PROQ_DB_USER --data-file=-
printf "REPLACE_WITH_STRONG_PASSWORD" | gcloud secrets create PROQ_DB_PASSWORD --data-file=-
printf "proq_pilot" | gcloud secrets create PROQ_DB_NAME --data-file=-
printf "REPLACE_WITH_LONG_RANDOM_JWT_SECRET" | gcloud secrets create PROQ_ACCESS_TOKEN_SECRET --data-file=-
```

Create the app/API secrets:

```bash
gcloud secrets create AZURE_TENANT_ID --data-file=-
gcloud secrets create AZURE_CLIENT_ID --data-file=-
gcloud secrets create AZURE_CLIENT_SECRET --data-file=-
gcloud secrets create PAYFAST_MERCHANT_ID --data-file=-
gcloud secrets create PAYFAST_MERCHANT_KEY --data-file=-
gcloud secrets create PAYFAST_PASSPHRASE --data-file=-
gcloud secrets create PAYFAST_RETURN_URL --data-file=-
gcloud secrets create PAYFAST_CANCEL_URL --data-file=-
gcloud secrets create PAYFAST_NOTIFY_URL --data-file=-
gcloud secrets create YOCO_SECRET_KEY --data-file=-
gcloud secrets create TARSON_API_URL --data-file=-
gcloud secrets create TARSON_API_TOKEN --data-file=-
gcloud secrets create CORE_API_URL --data-file=-
gcloud secrets create AXIZ_CLIENT_ID --data-file=-
gcloud secrets create AXIZ_CLIENT_SECRET --data-file=-
gcloud secrets create AXIZ_SCOPE --data-file=-
gcloud secrets create AXIZ_TOKEN_URL --data-file=-
gcloud secrets create AXIZ_BASE_URL --data-file=-
gcloud secrets create AXIZ_ACCOUNT_NUMBER --data-file=-
gcloud secrets create DUO_IKEY --data-file=-
gcloud secrets create DUO_SKEY --data-file=-
gcloud secrets create DUO_HOST --data-file=-
gcloud secrets create WESTCON_CLIENT_ID --data-file=-
gcloud secrets create WESTCON_CLIENT_SECRET --data-file=-
gcloud secrets create WESTCON_RESOURCE_ID --data-file=-
gcloud secrets create WESTCON_OAUTH_URL --data-file=-
gcloud secrets create WESTCON_SUBSCRIPTION_KEY --data-file=-
gcloud secrets create WESTCON_API_BASE_URL --data-file=-
gcloud secrets create WESTCON_MICROSOFT_LICENSES_PATH --data-file=-
gcloud secrets create STITCH_CLIENT_ID --data-file=-
gcloud secrets create STITCH_CLIENT_SECRET --data-file=-
gcloud secrets create STITCH_REDIRECT_URI --data-file=-
gcloud secrets create STITCH_WEBHOOK_SECRET --data-file=-
```

In PowerShell, after pasting a value for `--data-file=-`, press `Ctrl+Z`, then `Enter`.

Use these production callback values for the payment/provider dashboards and secrets:

- `PUBLIC_BASE_URL`: `https://proqpilot.com`
- `STITCH_REDIRECT_URI`: `https://proqpilot.com/api/v1/stitch-payment/verify`
- Stitch webhook URL: `https://proqpilot.com/webhook/stitch`
- `PAYFAST_RETURN_URL`: `https://proqpilot.com/order-success.html`
- `PAYFAST_CANCEL_URL`: `https://proqpilot.com/cart.html`
- `PAYFAST_NOTIFY_URL`: `https://proqpilot.com/webhook/payfast`
- Yoco webhook URL: `https://proqpilot.com/webhook/yoco`


Stitch Express uses STITCH_CLIENT_ID, STITCH_CLIENT_SECRET, STITCH_REDIRECT_URI, and optional STITCH_WEBHOOK_SECRET; cloudbuild.yaml binds these from Secret Manager. Do not set STITCH_SCOPE or use the Stitch Enterprise secure.stitch.money/connect/token endpoint for this project.


## 7. GitHub Trigger To Cloud Run

Create a Cloud Build trigger:

- Repository: `ProQ Pilot`
- Event: push to branch, usually `main`
- Build config file: `cloudbuild.yaml`
- Service deployed: `proq-pilot`

When GitHub pushes a commit, Cloud Build will:

1. Build the Docker image.
2. Push it to Artifact Registry.
3. Deploy `proq-pilot` to Cloud Run.
4. Attach Cloud SQL using `--add-cloudsql-instances`.
5. Inject only `PROQ_` secrets using `--set-secrets`.

## 8. Cloud Build IAM

The Cloud Build service account needs:

- `roles/run.admin`
- Artifact Registry write access
- `roles/iam.serviceAccountUser` on `proq-pilot-run`

## 9. Important Cloud Run Notes

- Cloud Run requires the app to listen on `process.env.PORT`; `server.js` now does this.
- `utils/db.js` now uses `/cloudsql/$INSTANCE_CONNECTION_NAME` in Cloud Run.
- Local `.env` values are ignored by Git and Docker.
- Product image uploads to `product_images/` are not durable in Cloud Run. For production, move uploaded images to Cloud Storage later.

## 10. Register `proqpilot.com` With Cloud Run

Google's direct Cloud Run domain mapping is currently marked Preview, and Google says it is not recommended for production services where the preview limitations matter. For this project in `us-central1`, the direct mapping command is:

```bash
gcloud beta run domain-mappings create \
  --service proq-pilot \
  --domain proqpilot.com \
  --region us-central1
```

Then fetch the DNS records Google generated:

```bash
gcloud beta run domain-mappings describe \
  --domain proqpilot.com \
  --region us-central1
```

Add every returned `resourceRecords` entry at your domain/DNS provider. If `www.proqpilot.com` should also work, create a second mapping for `www.proqpilot.com` or configure your DNS/provider to redirect `www` to the root domain.
## References

- Cloud Run continuous deployment from Git: https://cloud.google.com/run/docs/continuous-deployment-with-cloud-build
- Cloud Run to Cloud SQL for MySQL: https://cloud.google.com/sql/docs/mysql/connect-run
- Cloud Run secrets: https://cloud.google.com/run/docs/configuring/secrets
- Cloud Run service identity: https://cloud.google.com/run/docs/configuring/services/service-identity


