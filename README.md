# Pehnawa Fashion Hub

A full-stack fashion storefront built with the MERN stack.

[Live Store](https://www.pehnawafashionhub.com/) · [Source Code](https://github.com/AaditDhariwal21/PehnawaFashionHub)

---

Pehnawa is a full-stack e-commerce application for browsing fashion products, managing variants, and completing online purchases. It includes a customer storefront and an admin workspace, backed by an Express API and MongoDB.

The project goes beyond a product catalogue: the implementation covers variant-level inventory, account and guest checkout flows, Square payment verification, shipping-rate calculation, promo-code reservations, order tracking, and cloud-hosted product media.

## What’s inside

- **Storefront:** home, category browsing, search, product details, cart, wishlist, comparison, account and order pages.
- **Product variants:** each colour/size combination has its own price and stock.
- **Checkout:** server-side cart validation and price calculation, shipping calculation, promo validation, and Square-hosted payment.
- **Guest checkout:** optional feature controlled by a backend runtime flag; guest orders can be accessed through private order tokens and later claimed by an account.
- **Order lifecycle:** order creation is tied to verified payment state and is shared by the confirmation and webhook paths.
- **Admin tools:** product management, order management and promo-code management, protected by backend role checks.
- **Media:** Cloudinary storage and image delivery utilities.

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, Vite 7, React Router 7, Tailwind CSS 4, Lucide React |
| Backend | Node.js, Express 5 |
| Database | MongoDB with Mongoose 9 |
| Authentication | JWT, bcryptjs, cookie-parser |
| Payments | Square |
| Shipping | Shippo integration |
| Product images | Cloudinary, Multer storage adapter |
| Security / operations | Helmet, CORS, express-rate-limit, Morgan |
| Hosting | Vercel (frontend), Render (backend) |

## Architecture at a glance

```text
Browser (React + Vite)
  ├── Storefront pages and shared context providers
  ├── localStorage / sessionStorage for guest-side state
  └── HTTPS requests to Express API
                |
                v
       Express API (Render)
  ├── Routes -> middleware -> controllers
  ├── Services (orders, inventory, promos, shipping)
  ├── Mongoose models and indexes
  ├── Square payment API + webhook endpoint
  ├── Shippo shipping-rate API
  └── Cloudinary upload / media delivery
                |
                v
          MongoDB Atlas
```

The frontend is a single-page React application. The backend is organized into routes, controllers, services, models, middleware, configuration and utility modules. Business-critical calculations—especially checkout totals, promo eligibility and payment confirmation—are performed or verified on the server.

## Repository layout

```text
PehnawaFashionHub/
├── backend/
│   ├── src/
│   │   ├── config/          # database, Cloudinary, taxonomy and index migrations
│   │   ├── controllers/     # request handlers
│   │   ├── middlewares/     # auth, guest checkout, rate limits and uploads
│   │   ├── models/          # Mongoose schemas
│   │   ├── routes/          # API route definitions
│   │   ├── scripts/         # audits, backfills and verification scripts
│   │   ├── services/        # checkout, order, stock, promo and shipping logic
│   │   └── utils/           # validation, guest access, slugs and variants
│   └── package.json
└── frontend/
    ├── public/              # static assets and hero banner
    ├── src/
    │   ├── assets/
    │   ├── components/      # reusable UI components
    │   ├── context/         # auth, cart, wishlist, compare and UI state
    │   ├── pages/           # customer and admin routes
    │   └── utils/           # image, price, URL and checkout helpers
    ├── e2e/                 # browser-level flow checks
    └── package.json
```

## Run locally

### Requirements

- Node.js (a current LTS release is recommended)
- npm
- A MongoDB connection string
- Square sandbox credentials for testing checkout
- Cloudinary credentials for product media and uploads
- Shippo credentials if live shipping-rate calculation is to be exercised

### 1. Clone the project

```bash
git clone https://github.com/AaditDhariwal21/PehnawaFashionHub.git
cd PehnawaFashionHub
```

### 2. Configure the backend

Create `backend/.env`:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=replace_with_a_long_random_secret
FRONTEND_URL=http://localhost:5173

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

SQUARE_ACCESS_TOKEN=your_square_sandbox_access_token
SQUARE_ENVIRONMENT=sandbox
SQUARE_LOCATION_ID=your_square_location_id
SQUARE_WEBHOOK_SIGNATURE_KEY=your_square_webhook_signature_key
SQUARE_WEBHOOK_URL=your_public_webhook_url

SHIPPO_API_KEY=your_shippo_api_key
GUEST_CHECKOUT_ENABLED=false
TRUST_PROXY_HOPS=1
```

Install dependencies and start the API:

```bash
cd backend
npm install
npm run dev
```

The API defaults to `http://localhost:5000`.

### 3. Configure the frontend

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

Then start Vite in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

## Important flows

### Cart

Signed-out carts are stored in browser `localStorage`. Signed-in carts are persisted by the API and associated with the account. At sign-in, local cart lines are merged into the server cart; product identity includes product, colour and size.

### Checkout and payment

The frontend sends the chosen cart lines and shipping details. The backend reloads each product, resolves its selected variant, checks stock, calculates the subtotal and shipping cost, and validates any promo code. It then creates a Square checkout session and stores a `PendingOrder`. After payment, the application verifies the payment with Square before finalizing an order. Square webhooks provide an independent completion path.

### Inventory

Stock belongs to a (product, colour, size) variant, not merely to a product. Inventory application is centralized in the backend service and uses an order-level claim/ledger to avoid repeated deductions when confirmation and webhook events race or are retried.

### Guest orders

Guest checkout is disabled unless `GUEST_CHECKOUT_ENABLED` is exactly `true`. Guest order access uses a private token; the frontend keeps the token out of the URL path and places it in the URL fragment for private order links. The backend stores a hash rather than the raw token.

## Deployment

The checked-in frontend configuration includes a Vercel rewrite that sends application routes to `index.html`, which is needed for React Router deep links. The backend is structured for a Render deployment and reads secrets/configuration from environment variables. Production CORS allowlists the storefront domains configured in `backend/src/index.js`.

For production payments, use Square production credentials and configure the webhook URL/signature key in the Square dashboard. Confirm the production frontend origin, API URL, MongoDB access rules, Cloudinary credentials and shipping integration settings before launch.

## Useful scripts and checks

The backend includes operational scripts for image-size audits, order-integrity audits, taxonomy/slug backfills, Cloudinary URL updates and verification of guest checkout, promo-code and order-concurrency behaviour. The frontend contains browser-level checks under `frontend/e2e/`, plus a `test:variants` script for the variant editor.

```bash
# Frontend
npm run lint
npm run build
npm run test:variants

# Backend
npm run dev
npm start
```

## Notes

- The backend is the authority for prices, shipping, promotion rules, access control and payment verification. Frontend state is for interaction and convenience, not a trusted source for financial values.
- The Square webhook route uses a raw request body before the general JSON parser so the signature can be verified correctly.
- Guest checkout is a runtime backend feature flag; the storefront reads it from `/api/config` rather than baking it into the frontend build.
- Keep credentials, production database dumps and private customer data out of Git.

---

_Built as a real-world full-stack e-commerce project._
