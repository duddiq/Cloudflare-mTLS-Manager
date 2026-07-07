# Cloudflare mTLS Manager

A sleek, self-hosted web dashboard to manage Cloudflare mTLS (mutual TLS) Client Certificates, hostname associations, and administrator controls. It is built to run entirely on Cloudflare's serverless infrastructure (Pages, Functions, and D1 Database).

<div align="center">
  <img src="assets/banner.png" alt="Cloudflare mTLS Manager Dashboard" width="100%" style="border-radius: 8px; margin: 20px 0;" onerror="this.style.display='none'" />
</div>

---

## 🌟 Key Features

*   **Client Certificate Management**:
    *   Generate secure mTLS client certificates by submitting a Certificate Signing Request (CSR) directly from the UI.
    *   View a complete list of certificates with search, validity filters, and status markers (*Active*, *Revoked*, *Expired*).
    *   Download generated certificates in PEM format.
    *   Revoke and restore certificates dynamically with real-time sync to the Cloudflare API.
*   **Hostname Associations**:
    *   Easily bind mTLS client certificates to specific hostnames (subdomains) within your Cloudflare Zone to enforce mutual TLS access.
    *   Add and remove domain associations directly from the dashboard.
*   **Access & Role-Based Permissions**:
    *   Seamless integration with **Cloudflare Access** (authenticates requests via the JWT `cf-access-authenticated-user-email` header).
    *   **Administrator Role**: Manage all certificates, change user roles, and update hostname associations.
    *   **User Role**: Create and manage only their own certificates.
    *   Dedicated Admin Control Panel for user role assignment.
*   **Automated Cloudflare API Sync**:
    *   Periodically queries Cloudflare API client certificate lists to automatically sync and reconcile local D1 Database records with the cloud state.
*   **Fail-Safe Development Mode**:
    *   Built-in simulation/mock environment allows fully offline development and testing of frontend and API handlers without requiring active Cloudflare API credentials.

---

## 🛠️ Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | [React 19](https://react.dev/), [Vite](https://vite.dev/) | Modern, reactive UI built for speed. |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | Curated dark mode aesthetics and responsive layout. |
| **Backend API** | [Hono](https://hono.dev/) | Light, fast web framework running on [Cloudflare Pages Functions](https://pages.cloudflare.com/). |
| **Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) | Serverless SQL database (SQLite-based) with [Drizzle ORM](https://orm.drizzle.team/). |
| **Cryptography** | [node-forge](https://github.com/digitalbazaar/forge) | Client-side CSR parsing and certificate validation. |

---

## 🚀 Local Development

### Prerequisites

*   [Node.js](https://nodejs.org/) (v18+)
*   [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed automatically as a devDependency)

### Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/duddiq/cloudflare-mtls-manager.git
    cd cloudflare-mtls-manager
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure environment variables**:
    Copy the example configuration file:
    ```bash
    cp .env.example .dev.vars
    ```
    Open `.dev.vars` and adjust your variables:
    ```ini
    ENVIRONMENT=development
    MOCK_USER_EMAIL=admin@example.com
    ADMIN_USER=admin@example.com
    
    # Optional Cloudflare credentials to test real API connection locally:
    CLOUDFLARE_API_TOKEN="your_token"
    CLOUDFLARE_ZONE_ID="your_zone_id"
    CLOUDFLARE_ACCOUNT_ID="your_account_id"
    ```

4.  **Initialize local SQLite Database (D1)**:
    Create local D1 schema:
    ```bash
    npm run db:setup
    ```

5.  **Start development server**:
    ```bash
    npm run dev
    ```
    This launches:
    *   Vite dev server for the frontend (hot-reloads at `http://localhost:5173`).
    *   Wrangler Pages local proxy server (running at `http://localhost:3000`).
    
    *Always access the application via `http://localhost:3000` to allow the Hono API proxying to work correctly.*

---

## 🌐 Production Deployment

This project is optimized for native deployment via **Cloudflare Pages**.

### Step 1: Connect GitHub Repo to Cloudflare
1.  Go to your **Cloudflare Dashboard** -> **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git**.
2.  Select this repository.
3.  Set the **Build settings**:
    *   **Build command**: `npm run build`
    *   **Build output directory**: `dist`
4.  Click **Save and Deploy**.

### Step 2: Configure D1 Database Binding
1.  In your Cloudflare Pages project, go to **Settings** -> **Functions** -> **D1 database bindings**.
2.  Click **Add binding** under the **Production** environment:
    *   **Variable name**: `DB`
    *   **D1 database**: Select your production D1 database.
3.  Redeploy the application.

### Step 3: Configure Environment Variables
In your Pages project settings, go to **Settings** -> **Variables and secrets**. Define the following variables under **Production**:
*   `ENVIRONMENT`: `production` (strictly enforces headers authentication and disables mock fallback).
*   `CLOUDFLARE_ZONE_ID`: The Zone ID for your target domain.
*   `CLOUDFLARE_API_TOKEN`: Cloudflare API token with `Zone.ClientCertificates` permissions.
*   `ADMIN_USER`: The email address of the main administrator.

---

## 🔒 Security & Authentication

In production, the application **must** be protected by **Cloudflare Access** (part of Cloudflare Zero Trust):
*   Add a Self-Hosted Application in Zero Trust pointing to your Pages domain.
*   Set up an Access Policy to restrict entry to authorized users/emails.
*   The backend API automatically parses the cryptographic security header `cf-access-authenticated-user-email` passed by Cloudflare Access. If this header is missing or empty, the API immediately throws a `401 Unauthorized` error in production mode.

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
