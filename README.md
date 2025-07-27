GoQuant - Real-Time Orderbook Viewer & Simulation Tool
This project is a submission for the GoQuant front-end engineering assignment. It is a Next.js application that provides a real-time, multi-venue order book viewer for several cryptocurrency exchanges and includes an order simulation tool to help traders visualize market impact.

Features

✅ Multi-Venue Orderbook Display:

Displays real-time order books from three venues: OKX, Bybit, and Deribit.

Shows 15+ levels of best bids and best asks for each venue.

Seamlessly switch between venues with a clear connection status indicator.

✅ Real-Time Data Integration:

Utilizes WebSocket connections for live, low-latency data updates from all three exchanges.

Efficiently manages WebSocket lifecycle, connecting only to the active venue to conserve resources.

✅ Order Simulation Form:

An intuitive form to simulate Market and Limit orders.

Select side (Buy/Sell), input price and quantity, and simulate trade timing delays.

Includes robust form validation for all inputs.

✅ Order Placement Visualization:

Visually highlights the simulated order's exact position within the live order book using a distinct indicator.

Helps users immediately understand where their order would sit in relation to current market prices.

✅ Order Impact Metrics:

Calculates and displays critical order impact metrics, including:

Estimated Fill Percentage

Slippage Estimation

Potential Price Impact

Displays a clear warning for orders that are likely to cause significant slippage.

✅ Responsive Design:

The application is fully responsive and optimized for both desktop and mobile use cases, using a modern Tailwind CSS layout.

⭐ Bonus Feature: Market Depth Visualization:

Includes a market depth chart that visually represents the cumulative buy and sell pressure, providing an at-a-glance understanding of market liquidity.

💻 Technologies Used
Framework: Next.js (with App Router)

Language: JavaScript (ES6+)

UI Library: React

Styling: Tailwind CSS

Charting: Recharts

Icons: Lucide React

🚀 Setup and Running Locally
To get this project running on your local machine, please follow these steps.

Prerequisites:

Node.js (v18.x or later)

npm or yarn

1. Clone the Repository

git clone https://github.com/sai143-m/goquant-orderbook-viewer.git
cd goquant-orderbook-viewer

2. Install Dependencies
Install the required project dependencies using npm:

npm install

3. Run the Development Server
Start the Next.js development server:

npm run dev

4. Open the Application
Open your browser and navigate to http://localhost:3000. You should see the application running.

📚 API Documentation & Considerations
This application connects to the public WebSocket APIs of the following exchanges. No API keys are required.

OKX API: https://www.okx.com/docs-v5/

Bybit API: https://bybit-exchange.github.io/docs/v5/intro

Deribit API: https://docs.deribit.com/

Rate Limiting: The application is designed to be a good citizen regarding API usage. It only maintains one active WebSocket connection at a time (for the currently viewed venue) and properly closes connections when they are no longer needed. It also responds to exchange-specific keep-alive messages (pings/pongs) to maintain stable connections.

📝 Assumptions Made
Symbols: The application defaults to the most common perpetual swap or spot symbols for BTC/USD on each exchange (BTC-USD-SWAP, BTCUSDT, BTC-PERPETUAL). The form allows for these to be changed, but the initial connection uses these defaults.

Error Handling: The primary error handling focuses on WebSocket connection status (success, failure, disconnection), which is visually indicated in the UI. For a production environment, more granular error handling for data parsing and API messages would be implemented.
