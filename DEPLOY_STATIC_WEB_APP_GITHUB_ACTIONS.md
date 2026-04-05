# Deploy Frontend to Azure Static Web Apps via GitHub Actions

## Files Added

- `.github/workflows/deploy-static-web-app.yml`
- `frontend/public/staticwebapp.config.json`

## One-time Azure Setup

1. Create Azure Static Web App (Portal or CLI).
2. In the Static Web App resource, open **Manage deployment token** and copy the token.
3. In GitHub repo settings, add this secret:
   - `AZURE_STATIC_WEB_APPS_API_TOKEN`
4. Set API URL in `frontend/.env` (used during GitHub Actions build):

```env
VITE_LEAD_FOLLOWUP_BASE_URL=https://mgt-leadfollowup-func-0405.azurewebsites.net/api/v1/lead-followup
```

The workflow now builds using `frontend/.env` directly and does not rely on SWA app settings for this variable.

## Setting `VITE_LEAD_FOLLOWUP_BASE_URL` in SWA Portal

`VITE_LEAD_FOLLOWUP_BASE_URL` is a Vite build-time variable. For this project, the frontend is built in GitHub Actions before deployment, so changing Static Web App portal settings will not rewrite the already-built JavaScript bundle.

Use one of these approaches:

### Approach 1: Keep value in `frontend/.env` (current setup)

1. Open `frontend/.env`.
2. Set:

```env
VITE_LEAD_FOLLOWUP_BASE_URL=https://mgt-leadfollowup-func-0405.azurewebsites.net/api/v1/lead-followup
```

3. Commit and push changes (if `.env` is intentionally tracked in your repo workflow).
4. Trigger the workflow by pushing to `main`/`master`.
5. GitHub Actions runs `npm run build`, and Vite injects the value from `frontend/.env` into the build.

### Approach 2: Inject from GitHub Actions variables during build

1. In GitHub repo, go to **Settings -> Secrets and variables -> Actions -> Variables**.
2. Create variable:
    - Name: `VITE_LEAD_FOLLOWUP_BASE_URL`
    - Value: `https://mgt-leadfollowup-func-0405.azurewebsites.net/api/v1/lead-followup`
3. Update workflow build step in `.github/workflows/deploy-static-web-app.yml`:

```yaml
- name: Build frontend
   working-directory: frontend
   env:
      VITE_LEAD_FOLLOWUP_BASE_URL: ${{ vars.VITE_LEAD_FOLLOWUP_BASE_URL }}
   run: npm run build
```

4. Commit and push workflow changes.
5. Trigger deployment; the variable is injected during build without relying on `frontend/.env`.

If you need changing base URL without rebuilding, use a runtime `config.json` pattern instead of Vite `import.meta.env`.

## Azure Portal Steps (GitHub Actions)

1. Open Azure Portal -> **Create a resource** -> search **Static Web App**.
2. Resource Group: choose your existing RG (for example `rg-mgt-assessment`).
3. Name: choose a unique app name (for example `mgt-leadfollowup-frontend`).
4. Hosting plan: **Free** (or Standard if needed).
5. Region: pick nearest region.
6. Deployment details:
   - Source: **GitHub**
   - Organization: your GitHub org/user
   - Repository: this repo
   - Branch: `main` (or `master`)
7. Build details in portal:
   - Build preset: **Custom**
   - App location: `/`
   - Api location: leave blank
   - Output location: leave blank
   (We use our custom workflow in `.github/workflows/deploy-static-web-app.yml`.)
8. Click **Review + create** -> **Create**.
9. After resource is created, go to Static Web App -> **Manage deployment token** -> copy token.
10. In GitHub repo: **Settings -> Secrets and variables -> Actions -> New repository secret**:
    - Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
    - Value: token from step 9
11. Commit and push any change under `frontend/` (or run workflow manually if enabled) to trigger deployment.
12. Verify:
    - Actions tab shows successful run.
    - Static Web App URL loads frontend.
    - Frontend calls your Function URL from `frontend/.env`.

## Triggering Deployments

- Push to `main` or `master` with changes in `frontend/**`.
- Pull requests to `main`/`master` also deploy preview environments.
- Closing a PR closes its preview environment.

## Notes

- The workflow builds the app with Node.js 20 and deploys the built `frontend/dist` folder.
- `staticwebapp.config.json` is placed in `frontend/public`, so Vite copies it to `dist` during build.
