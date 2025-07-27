"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChevronDown, AlertCircle, CheckCircle } from 'lucide-react';

// --- MOCK DATA (for initial render and fallback) ---
const createMockOrderbook = (midPrice, levels = 15) => {
  const bids = [];
  const asks = [];
  for (let i = 1; i <= levels; i++) {
    bids.push([(midPrice - i * 0.5).toFixed(2), (Math.random() * 10).toFixed(4)]);
    asks.push([(midPrice + i * 0.5).toFixed(2), (Math.random() * 10).toFixed(4)]);
  }
  return { bids, asks };
};

const MOCK_ORDERBOOKS = {
  OKX: createMockOrderbook(68000),
  Bybit: createMockOrderbook(68050),
  Deribit: createMockOrderbook(68025),
};


// --- CUSTOM HOOK for WebSocket Connections ---
const useOrderbookWebSocket = (venue, symbol, isVisible) => {
    const [orderbook, setOrderbook] = useState({ bids: [], asks: [] });
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef(null);

    const venueConfig = useMemo(() => ({
        OKX: {
            url: 'wss://ws.okx.com:8443/ws/v5/public',
            subscribe: (instId) => ({ op: 'subscribe', args: [{ channel: 'books', instId }] }),
            unsubscribe: (instId) => ({ op: 'unsubscribe', args: [{ channel: 'books', instId }] }),
            parse: (data) => {
                if (data.arg && data.arg.channel === 'books' && data.data && data.data.length > 0) {
                    const { bids, asks } = data.data[0];
                    return { bids, asks: asks.reverse() }; // OKX asks are ascending, we need descending from best ask
                }
            }
        },
        Bybit: {
            url: 'wss://stream.bybit.com/v5/public/spot',
            subscribe: (instId) => ({ op: 'subscribe', args: [`orderbook.50.${instId}`] }),
            unsubscribe: (instId) => ({ op: 'unsubscribe', args: [`orderbook.50.${instId}`] }),
            parse: (data) => {
                if (data.topic && data.topic.startsWith('orderbook.50') && data.data) {
                    const { b: bids, a: asks } = data.data;
                    return { bids, asks };
                }
            }
        },
        Deribit: {
            url: 'wss://www.deribit.com/ws/api/v2',
            subscribe: (instId) => ({
                jsonrpc: '2.0',
                method: 'public/subscribe',
                params: { channels: [`book.${instId}.100ms`] }
            }),
            unsubscribe: (instId) => ({
                jsonrpc: '2.0',
                method: 'public/unsubscribe',
                params: { channels: [`book.${instId}.100ms`] }
            }),
            parse: (data) => {
                if (data.params && data.params.channel.startsWith('book.') && data.params.data) {
                    const { bids, asks } = data.params.data;
                    // Deribit gives [price, size] format
                    return {
                        bids: bids.map(b => [b[0].toString(), b[1].toString()]),
                        asks: asks.map(a => [a[0].toString(), a[1].toString()])
                    };
                }
            }
        }
    }), []);

    useEffect(() => {
        if (!venue || !symbol || !isVisible) {
             if (ws.current) {
                ws.current.close();
                ws.current = null;
            }
            return;
        }

        const config = venueConfig[venue];
        if (!config) return;

        ws.current = new WebSocket(config.url);
        let pingInterval;

        ws.current.onopen = () => {
            console.log(`[${venue}] WebSocket connected.`);
            ws.current.send(JSON.stringify(config.subscribe(symbol)));
            setIsConnected(true);

            // Bybit requires a ping every 20s
            if (venue === 'Bybit') {
                pingInterval = setInterval(() => {
                    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                        ws.current.send(JSON.stringify({ op: 'ping' }));
                    }
                }, 20000);
            }
        };

        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            // Handle pings from exchanges
            if (data.event === 'pong' || data.op === 'pong' || (venue === 'Deribit' && data.method === 'heartbeat')) {
                return;
            }
            
            const newOrderbook = config.parse(data);
            if (newOrderbook) {
                setOrderbook(newOrderbook);
            }
        };

        ws.current.onerror = (error) => {
            console.error(`[${venue}] WebSocket error:`, error);
            setIsConnected(false);
        };

        ws.current.onclose = () => {
            console.log(`[${venue}] WebSocket disconnected.`);
            setIsConnected(false);
            clearInterval(pingInterval);
        };

        return () => {
            if (ws.current) {
                if (ws.current.readyState === WebSocket.OPEN) {
                   try {
                     ws.current.send(JSON.stringify(config.unsubscribe(symbol)));
                   } catch(e) {
                     console.error("Error unsubscribing:", e);
                   }
                }
                ws.current.close();
            }
            clearInterval(pingInterval);
        };
    }, [venue, symbol, isVisible, venueConfig]);

    return { orderbook, isConnected };
};


// --- UI Components ---

const VenueTabs = ({ venues, activeVenue, setActiveVenue, connectionStatus }) => (
    <div className="flex border-b border-gray-700">
        {venues.map(venue => (
            <button
                key={venue}
                onClick={() => setActiveVenue(venue)}
                className={`flex items-center px-4 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none ${
                    activeVenue === venue
                        ? 'border-b-2 border-blue-500 text-white'
                        : 'text-gray-400 hover:bg-gray-800'
                }`}
            >
                <span className={`w-2 h-2 rounded-full mr-2 ${connectionStatus[venue] ? 'bg-green-500' : 'bg-red-500'}`}></span>
                {venue}
            </button>
        ))}
    </div>
);

const OrderBook = ({ bids, asks, simulatedOrder }) => {
    const maxCumulative = useMemo(() => {
        const bidTotal = bids.slice(0, 15).reduce((acc, curr) => acc + parseFloat(curr[1]), 0);
        const askTotal = asks.slice(0, 15).reduce((acc, curr) => acc + parseFloat(curr[1]), 0);
        return Math.max(bidTotal, askTotal);
    }, [bids, asks]);
    
    const formatPrice = (price) => parseFloat(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatSize = (size) => parseFloat(size).toFixed(4);

    const OrderRow = ({ price, size, cumulative, type, isSimulated }) => {
        const percentage = (cumulative / maxCumulative) * 100;
        const bgColor = type === 'bid' ? 'bg-green-500/20' : 'bg-red-500/20';
        const textColor = type === 'bid' ? 'text-green-400' : 'text-red-400';
        const barAlign = type === 'bid' ? 'right-0' : 'left-0';

        return (
            <tr className={`relative text-xs hover:bg-gray-700/50 ${isSimulated ? 'ring-2 ring-yellow-400' : ''}`}>
                <td className={`p-1.5 ${textColor}`}>{formatPrice(price)}</td>
                <td className="p-1.5 text-white text-right">{formatSize(size)}</td>
                <td className="p-1.5 text-gray-400 text-right">{formatSize(cumulative)}</td>
                <td className="absolute top-0 bottom-0 h-full" style={{ left: type === 'bid' ? 'auto' : 0, right: type === 'bid' ? 0 : 'auto', width: `${percentage}%`, zIndex: -1 }}>
                    <div className={`h-full ${bgColor} opacity-50`}></div>
                </td>
            </tr>
        );
    };

    let cumulativeBid = 0;
    let cumulativeAsk = 0;

    const findSimulatedIndex = (levels, order) => {
        if (!order) return -1;
        const price = parseFloat(order.price);
        if (order.side === 'Buy') { // Looking for asks
            return levels.findIndex(ask => price >= parseFloat(ask[0]));
        } else { // Looking for bids
            return levels.findIndex(bid => price <= parseFloat(bid[0]));
        }
    };

    const simulatedAskIndex = findSimulatedIndex(asks, simulatedOrder);
    const simulatedBidIndex = findSimulatedIndex(bids, simulatedOrder);

    return (
        <div className="bg-gray-900 rounded-lg p-4 flex-grow min-h-[400px]">
            <h3 className="text-lg font-semibold text-white mb-2">Order Book</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <table className="w-full border-collapse relative">
                        <thead>
                            <tr className="text-gray-500 text-xs">
                                <th className="text-left p-1 font-normal">Price (USD)</th>
                                <th className="text-right p-1 font-normal">Size (BTC)</th>
                                <th className="text-right p-1 font-normal">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bids.slice(0, 15).map(([price, size], index) => {
                                cumulativeBid += parseFloat(size);
                                return <OrderRow key={index} price={price} size={size} cumulative={cumulativeBid} type="bid" isSimulated={simulatedOrder?.side === 'Sell' && index === simulatedBidIndex} />;
                            })}
                        </tbody>
                    </table>
                </div>
                <div>
                    <table className="w-full border-collapse relative">
                        <thead>
                            <tr className="text-gray-500 text-xs">
                                <th className="text-left p-1 font-normal">Price (USD)</th>
                                <th className="text-right p-1 font-normal">Size (BTC)</th>
                                <th className="text-right p-1 font-normal">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {asks.slice(0, 15).map(([price, size], index) => {
                                cumulativeAsk += parseFloat(size);
                                return <OrderRow key={index} price={price} size={size} cumulative={cumulativeAsk} type="ask" isSimulated={simulatedOrder?.side === 'Buy' && index === simulatedAskIndex} />;
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const DepthChart = ({ bids, asks }) => {
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const chartData = useMemo(() => {
        // Process bids: filter, parse, and calculate cumulative size
        let cumulativeBidSize = 0;
        const bidData = bids.slice(0, 50).reverse().reduce((acc, [priceStr, sizeStr]) => {
            const price = parseFloat(priceStr);
            const size = parseFloat(sizeStr);
            // Only include valid numbers
            if (!isNaN(price) && !isNaN(size)) {
                cumulativeBidSize += size;
                acc.push({ price, size: cumulativeBidSize });
            }
            return acc;
        }, []);

        // Process asks: filter, parse, and calculate cumulative size
        let cumulativeAskSize = 0;
        const askData = asks.slice(0, 50).reduce((acc, [priceStr, sizeStr]) => {
            const price = parseFloat(priceStr);
            const size = parseFloat(sizeStr);
            // Only include valid numbers
            if (!isNaN(price) && !isNaN(size)) {
                cumulativeAskSize += size;
                acc.push({ price, size: cumulativeAskSize });
            }
            return acc;
        }, []);

        return { bids: bidData, asks: askData };
    }, [bids, asks]);

    // Render placeholder if there's no valid data to display
    if (chartData.bids.length === 0 || chartData.asks.length === 0) {
        return <div className="text-center text-gray-500 p-8">Waiting for data to render depth chart...</div>;
    }

    const priceDomain = [chartData.bids[0].price, chartData.asks[chartData.asks.length - 1].price];

    return (
        <div className="bg-gray-900 rounded-lg p-4 mt-4 h-64">
             <h3 className="text-lg font-semibold text-white mb-2">Market Depth</h3>
            {isClient ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
                        <defs>
                            <linearGradient id="colorBid" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorAsk" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="price" type="number" domain={priceDomain} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={(val) => val.toLocaleString()} allowDataOverflow />
                        <YAxis orientation="right" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={(val) => val.toFixed(2)} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #4B5563', borderRadius: '0.5rem' }}
                            labelStyle={{ color: '#F9FAFB' }}
                            formatter={(value, name) => [`${value.toFixed(4)} BTC`, name]}
                        />
                        <Legend wrapperStyle={{ color: '#9CA3AF', paddingTop: '10px' }} />
                        <Area type="step" dataKey="size" data={chartData.bids} stroke="#10B981" fill="url(#colorBid)" name="Bids" />
                        <Area type="step" dataKey="size" data={chartData.asks} stroke="#EF4444" fill="url(#colorAsk)" name="Asks" />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500">Loading Chart...</div>
            )}
        </div>
    );
};

const OrderForm = ({ onSubmit }) => {
    const [formData, setFormData] = useState({
        symbol: 'BTC-USD-SWAP',
        orderType: 'Limit',
        side: 'Buy',
        price: '',
        quantity: '',
        delay: '0'
    });
    
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (formData.orderType === 'Limit' && (!formData.price || parseFloat(formData.price) <= 0)) {
            setError('Please enter a valid price for a limit order.');
            return;
        }
        if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
            setError('Please enter a valid quantity.');
            return;
        }
        onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-lg p-4 space-y-4">
            <h3 className="text-lg font-semibold text-white">Simulate Order</h3>
            
            <div>
                <label className="text-sm text-gray-400">Symbol</label>
                <input type="text" name="symbol" value={formData.symbol} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 mt-1 text-white focus:ring-blue-500 focus:border-blue-500" />
                 <p className="text-xs text-gray-500 mt-1">OKX: BTC-USD-SWAP, Bybit: BTCUSDT, Deribit: BTC-PERPETUAL</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-sm text-gray-400">Side</label>
                    <div className="flex mt-1">
                        <button type="button" onClick={() => setFormData(p => ({...p, side: 'Buy'}))} className={`w-full p-2 rounded-l-md ${formData.side === 'Buy' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>Buy</button>
                        <button type="button" onClick={() => setFormData(p => ({...p, side: 'Sell'}))} className={`w-full p-2 rounded-r-md ${formData.side === 'Sell' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>Sell</button>
                    </div>
                </div>
                 <div>
                    <label className="text-sm text-gray-400">Type</label>
                    <div className="flex mt-1">
                        <button type="button" onClick={() => setFormData(p => ({...p, orderType: 'Limit'}))} className={`w-full p-2 rounded-l-md ${formData.orderType === 'Limit' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>Limit</button>
                        <button type="button" onClick={() => setFormData(p => ({...p, orderType: 'Market'}))} className={`w-full p-2 rounded-r-md ${formData.orderType === 'Market' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>Market</button>
                    </div>
                </div>
            </div>

            {formData.orderType === 'Limit' && (
                <div>
                    <label className="text-sm text-gray-400">Price (USD)</label>
                    <input type="number" name="price" value={formData.price} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 mt-1 text-white focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., 68000.50" />
                </div>
            )}

            <div>
                <label className="text-sm text-gray-400">Quantity (BTC)</label>
                <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 mt-1 text-white focus:ring-blue-500 focus:border-blue-500" placeholder="e.g., 0.5" />
            </div>

            <div>
                <label className="text-sm text-gray-400">Timing Simulation</label>
                <select name="delay" value={formData.delay} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-2 mt-1 text-white focus:ring-blue-500 focus:border-blue-500">
                    <option value="0">Immediate</option>
                    <option value="5">5s Delay</option>
                    <option value="10">10s Delay</option>
                    <option value="30">30s Delay</option>
                </select>
            </div>
            
            {error && <p className="text-sm text-red-500 flex items-center"><AlertCircle className="w-4 h-4 mr-2"/>{error}</p>}

            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
                Simulate Order Placement
            </button>
        </form>
    );
};

const MetricsDisplay = ({ metrics }) => {
    if (!metrics) {
        return (
            <div className="bg-gray-900 rounded-lg p-4 mt-4 text-center text-gray-500">
                <p>Submit an order simulation to see impact metrics.</p>
            </div>
        );
    }

    const { fillPercent, slippage, impact, warning } = metrics;

    return (
        <div className="bg-gray-900 rounded-lg p-4 mt-4 space-y-3">
            <h3 className="text-lg font-semibold text-white">Order Impact Metrics</h3>
            <div className="text-sm space-y-2">
                <div className="flex justify-between">
                    <span className="text-gray-400">Est. Fill Percentage:</span>
                    <span className="text-white font-mono">{fillPercent.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Slippage:</span>
                    <span className="text-white font-mono">{slippage.toFixed(4)}%</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Market Impact (Price):</span>
                    <span className="text-white font-mono">${impact.toFixed(2)}</span>
                </div>
            </div>
            {warning && (
                 <div className="p-3 bg-yellow-900/50 border border-yellow-700 rounded-md text-yellow-300 text-sm flex items-start">
                    <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                    <span>{warning}</span>
                </div>
            )}
            {!warning && (
                 <div className="p-3 bg-green-900/50 border border-green-700 rounded-md text-green-300 text-sm flex items-start">
                    <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Order size has minimal expected market impact.</span>
                </div>
            )}
        </div>
    );
};


// --- Main App Component ---
export default function Page() {
    const venues = ['OKX', 'Bybit', 'Deribit'];
    const [activeVenue, setActiveVenue] = useState('OKX');
    const [symbol, setSymbol] = useState('BTC-USD-SWAP');
    const [simulatedOrder, setSimulatedOrder] = useState(null);
    const [simulationMetrics, setSimulationMetrics] = useState(null);
    const simulationTimeout = useRef(null);

    const { orderbook: okxOrderbook, isConnected: okxConnected } = useOrderbookWebSocket('OKX', 'BTC-USD-SWAP', activeVenue === 'OKX');
    const { orderbook: bybitOrderbook, isConnected: bybitConnected } = useOrderbookWebSocket('Bybit', 'BTCUSDT', activeVenue === 'Bybit');
    const { orderbook: deribitOrderbook, isConnected: deribitConnected } = useOrderbookWebSocket('Deribit', 'BTC-PERPETUAL', activeVenue === 'Deribit');

    const connectionStatus = { OKX: okxConnected, Bybit: bybitConnected, Deribit: deribitConnected };

    const currentOrderbook = useMemo(() => {
        switch (activeVenue) {
            case 'OKX': return okxOrderbook;
            case 'Bybit': return bybitOrderbook;
            case 'Deribit': return deribitOrderbook;
            default: return { bids: [], asks: [] };
        }
    }, [activeVenue, okxOrderbook, bybitOrderbook, deribitOrderbook]);

    const calculateMetrics = useCallback((order, book) => {
        const { side, quantity, orderType, price } = order;
        const qty = parseFloat(quantity);
        
        let filledQty = 0;
        let totalCost = 0;
        let slippage = 0;
        let impact = 0;
        let warning = '';

        const bookSide = side === 'Buy' ? book.asks : book.bids;
        const entryPrice = parseFloat(bookSide[0]?.[0] || '0');
        
        if (orderType === 'Market') {
            let qtyToFill = qty;
            for (const [levelPrice, levelQty] of bookSide) {
                const p = parseFloat(levelPrice);
                const q = parseFloat(levelQty);
                const fillable = Math.min(qtyToFill, q);
                
                filledQty += fillable;
                totalCost += fillable * p;
                qtyToFill -= fillable;

                if (qtyToFill <= 0) break;
            }
            const avgFillPrice = totalCost / filledQty;
            if (entryPrice > 0 && filledQty > 0) {
                slippage = Math.abs((avgFillPrice - entryPrice) / entryPrice) * 100;
            }
            impact = Math.abs(avgFillPrice - entryPrice);
        } else { // Limit Order
            const limitPrice = parseFloat(price);
            let qtyToFill = qty;
            for (const [levelPrice, levelQty] of bookSide) {
                const p = parseFloat(levelPrice);
                const q = parseFloat(levelQty);

                const canFill = side === 'Buy' ? p <= limitPrice : p >= limitPrice;
                if (canFill) {
                    const fillable = Math.min(qtyToFill, q);
                    filledQty += fillable;
                    qtyToFill -= fillable;
                }
                if (qtyToFill <= 0) break;
            }
        }
        
        const fillPercent = qty > 0 ? (filledQty / qty) * 100 : 100;

        if (slippage > 0.5) {
            warning = `High slippage warning! Your order may cause a price impact of approximately $${impact.toFixed(2)}.`;
        }

        return { fillPercent, slippage, impact, warning };
    }, []);

    const handleSimulationSubmit = useCallback((formData) => {
        if (simulationTimeout.current) {
            clearTimeout(simulationTimeout.current);
        }
        
        setSymbol(formData.symbol);
        
        const executeSimulation = () => {
            const book = currentOrderbook;
            let orderPrice = formData.price;
            if (formData.orderType === 'Market') {
                 if (formData.side === 'Buy' && book.asks.length > 0) {
                    orderPrice = book.asks[0][0];
                } else if (formData.side === 'Sell' && book.bids.length > 0) {
                    orderPrice = book.bids[0][0];
                }
            }
            
            const order = { ...formData, price: orderPrice };
            setSimulatedOrder(order);
            const metrics = calculateMetrics(order, book);
            setSimulationMetrics(metrics);
        };

        const delay = parseInt(formData.delay, 10) * 1000;
        if (delay > 0) {
            simulationTimeout.current = setTimeout(executeSimulation, delay);
        } else {
            executeSimulation();
        }
    }, [currentOrderbook, calculateMetrics]);

    return (
        <div className="bg-gray-950 text-white min-h-screen font-sans p-4 lg:p-6">
            <div className="max-w-screen-2xl mx-auto">
                <header className="mb-6">
                    <h1 className="text-3xl font-bold text-white">GoQuant Real-Time Orderbook</h1>
                    <p className="text-gray-400">Live Orderbook Viewer & Simulation Tool</p>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <OrderForm onSubmit={handleSimulationSubmit} />
                        <MetricsDisplay metrics={simulationMetrics} />
                    </div>
                    <div className="lg:col-span-2 bg-gray-800 rounded-lg shadow-lg">
                        <VenueTabs venues={venues} activeVenue={activeVenue} setActiveVenue={setActiveVenue} connectionStatus={connectionStatus} />
                        <OrderBook bids={currentOrderbook.bids} asks={currentOrderbook.asks} simulatedOrder={simulatedOrder} />
                        <DepthChart bids={currentOrderbook.bids} asks={currentOrderbook.asks} />
                    </div>
                </main>
            </div>
        </div>
    );
}
