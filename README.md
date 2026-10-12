# ShopMate

A full-stack ecommerce platform built with a Node.js/Express backend and a Next.js frontend. The system supports product browsing, cart management, order processing, real-time notifications, delivery driver assignment, and PayPal-based payments.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [PayPal Setup](#paypal-setup)
- [Getting Started](#getting-started)
- [API Modules](#api-modules)
- [Scripts](#scripts)

---

## Overview

This project is a monorepo containing two main services:

- **Backend** — A REST API built with Express and TypeScript, connected to hosted MongoDB, Redis, RabbitMQ, and integrated with PayPal REST Orders v2, Cloudinary, and Nodemailer.
- **Frontend** — A Next.js 16 application using React 19, Tailwind CSS, Socket.IO for real-time updates, Leaflet for map-based delivery tracking, and PayPal JavaScript SDK for secure checkout.

---

## Tech Stack

### Backend

| Technology     | Purpose                              |
|----------------|--------------------------------------|
| Node.js        | Runtime environment                  |
| Express 5      | HTTP server and routing              |
| TypeScript     | Type-safe development                |
| MongoDB        | Primary database via Mongoose        |
| Redis          | Caching and session management       |
| RabbitMQ       | Asynchronous job queue (via amqplib) |
| Socket.IO      | Real-time bidirectional events       |
| PayPal REST v2 | Secure payment and refund processing |
| Cloudinary     | Image storage and delivery           |
| Nodemailer     | Transactional email                  |
| Pino           | Structured logging                   |
| Sentry         | Error monitoring                     |

### Frontend

| Technology     | Purpose                              |
|----------------|--------------------------------------|
| Next.js 16     | React framework with SSR/SSG         |
| React 19       | UI library                           |
| TypeScript     | Type safety                          |
| Tailwind CSS 4 | Utility-first minimal light styling  |
| PayPal SDK     | React PayPal JS checkout buttons     |
| Socket.IO      | Real-time event handling             |
| Leaflet        | Interactive maps for delivery tracking |
| Sentry         | Frontend error monitoring            |

---

## Project Structure

```
ShopMate/
├── backend/
│   ├── src/
│   │   ├── app.ts              # Express app setup
│   │   ├── server.ts           # Entry point
│   │   ├── config/             # Database and service configs
│   │   ├── middleware/         # Auth, error handling, logging
│   │   ├── models/             # Mongoose schemas
│   │   ├── modules/            # Feature modules (see below)
│   │   ├── routes/             # Route aggregator
│   │   └── utils/              # Structured logger
│   ├── tsconfig.json
│   └── package.json
├── frontend/
│   ├── app/                    # Next.js App Router pages
│   ├── next.config.mjs
│   ├── tsconfig.json
│   └── package.json
└── README.md
```

---

## Features

- User registration, login, and JWT-based authentication
- Admin registration portal protected by server secret key
- Product catalogue with categories and image uploads via Cloudinary
- Shopping cart management
- Order placement with server-side pricing validation
- PayPal checkout with smart buttons and server-side capture
- Real-time order status updates via Socket.IO
- Delivery driver assignment and shipment tracking with live map view
- In-app chat between customers and support
- Transactional email notifications via Nodemailer (hosted SMTP)
- Background job processing and event publishing via RabbitMQ
- Redis caching for product listings and driver locations
- Structured logging with Pino (secrets redacted) and error tracking with Sentry

---

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- Hosted MongoDB instance (e.g. MongoDB Atlas)
- Hosted Redis instance (e.g. Upstash, Redis Cloud)
- Hosted RabbitMQ instance (e.g. CloudAMQP)
- PayPal Developer account (Sandbox / Live)
- Cloudinary account and API credentials
- Hosted SMTP credentials (e.g. Gmail App Password, SendGrid, Resend)

---

## Environment Variables

### Backend (`backend/.env` / Render)

Create a `.env` file in `backend/` (or configure in Render environment settings):

```env
PORT=4000
NODE_ENV=production
FRONTEND_URL=https://ecommerce-q1ph.vercel.app

# Database & Cache (Hosted)
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/aura_db?retryWrites=true&w=majority
REDIS_URL=rediss://default:<password>@<host>:<port>

# Message Broker (Hosted)
RABBITMQ_URL=amqps://<username>:<password>@<host>/<vhost>

# Authentication
JWT_SECRET=your_jwt_secret_key
ADMIN_SECRET_KEY=your_admin_secret_key

# Hosted SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM="ShopMate <support@shopmate.com>"

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# PayPal Configuration (Sandbox / Live)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
PAYPAL_ENV=sandbox

# Monitoring
SENTRY_DSN=your_sentry_dsn
```

### Frontend (`frontend/.env.local` / Vercel)

Create a `.env.local` file in `frontend/` (or configure in Vercel environment settings):

```env
NEXT_PUBLIC_API_URL=https://<your-backend-host>/api
NEXT_PUBLIC_SOCKET_URL=https://<your-backend-host>
NEXT_PUBLIC_PAYPAL_CLIENT_ID=your_paypal_client_id
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
```

---

## PayPal Setup

ShopMate utilizes PayPal REST Orders v2 for payments. Follow these steps to set up PayPal Sandbox:

### 1. Create a PayPal Developer App
1. Navigate to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Log in and switch to **Sandbox** mode.
3. Under **Apps & Credentials**, click **Create App**.
4. Set App Name to `ShopMate`, select **Merchant** type, and click **Create App**.
5. Copy your **Client ID** and **Secret**:
   - Set `PAYPAL_CLIENT_ID` in `backend/.env` (and Render).
   - Set `PAYPAL_CLIENT_SECRET` in `backend/.env` (and Render).
   - Set `NEXT_PUBLIC_PAYPAL_CLIENT_ID` in `frontend/.env.local` (and Vercel).
   - Set `PAYPAL_ENV=sandbox` (or `live` in production).

### 2. Register Webhook
1. Under your app settings, scroll to the **Webhooks** section and click **Add Webhook**.
2. **Webhook URL**:
   ```
   https://<your-backend-host>/api/payment/paypal/webhook
   ```
3. **Event Types to Subscribe To**:
   - `Payment capture completed` (`PAYMENT.CAPTURE.COMPLETED`)
   - `Payment capture denied` (`PAYMENT.CAPTURE.DENIED`)
   - `Payment capture refunded` (`PAYMENT.CAPTURE.REFUNDED`)
4. Save the webhook and copy the generated **Webhook ID**.
5. Set `PAYPAL_WEBHOOK_ID` in `backend/.env` (and Render).

### 3. Manual Testing Checklist
- [ ] **Checkout via PayPal Buttons**: Add an item to cart, go to checkout, and click the PayPal button.
- [ ] **Sandbox Approval**: Sign in with a PayPal Sandbox personal buyer account and approve the payment.
- [ ] **Capture & Order Completion**: Verify that the browser redirects to `/orders/<id>?payment=success`, the order status turns to `paid`, and cart is cleared.
- [ ] **Badges**: Verify that the order history and order details display the blue `PayPal` badge.
- [ ] **Webhook Simulation**: In PayPal Developer Dashboard $\rightarrow$ Webhooks Simulator, send a `PAYMENT.CAPTURE.COMPLETED` or `PAYMENT.CAPTURE.REFUNDED` event to `https://<backend-host>/api/payment/paypal/webhook` and verify 200 response and DB update.
- [ ] **Admin Refund**: Call `POST /api/payment/paypal/refund/:orderId` with an admin JWT token to verify refund execution, updating order status to `cancelled` and payment status to `refunded`.

---

## Getting Started

### 1. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Set up your `.env` file in `backend/` and `.env.local` in `frontend/` pointing to your hosted MongoDB, Redis, RabbitMQ, Cloudinary, PayPal sandbox, and SMTP services as described in [Environment Variables](#environment-variables).

### 3. Run the Services

```bash
# Backend (Development)
cd backend
npm run dev

# Or Backend (Production Build & Start)
npm run build
npm run start

# Frontend (In another terminal)
cd frontend
npm run dev

# Or Frontend (Production Build & Start)
npm run build
npm run start
```

The frontend will be available at `http://localhost:8081` (or `http://localhost:3000`).  
The backend API will be available at `http://localhost:4000` (or configured `PORT`).

---

## API Modules

The backend is organised into self-contained feature modules under `src/modules/`:

| Module          | Responsibility                                      |
|-----------------|-----------------------------------------------------|
| `auth`          | Customer registration, driver auth, and admin auth  |
| `users`         | User profile and address management                 |
| `categories`    | Product category browsing                           |
| `products`      | Product catalogue, variants, and stock management   |
| `cart`          | Redis-backed shopping cart management               |
| `orders`        | Atomic inventory locks and order lifecycle          |
| `payment`       | PayPal Orders v2 integration, capture, and webhooks |
| `shipping`      | Shipment lifecycle and tracking                     |
| `drivers`       | Driver registration, assignment, and live location  |
| `notifications` | Real-time and persistent notification management    |
| `chat`          | Customer support messaging                          |
| `mail`          | Hosted SMTP email dispatch helpers                  |
| `jobs`          | RabbitMQ consumer and background workers            |

---

## Scripts

### Backend

```bash
npm run dev      # Start backend with nodemon (hot reload)
npm run build    # Compile TypeScript to dist/
npm run start    # Run compiled production build (node dist/server.js)
```

### Frontend

```bash
npm run dev      # Start Next.js dev server on port 8081
npm run build    # Build Next.js for production
npm run start    # Serve Next.js production build
npm run lint     # Run ESLint
npm run lint:fix # Auto-fix lint issues
```

---

## License

This project is licensed under the ISC License.
