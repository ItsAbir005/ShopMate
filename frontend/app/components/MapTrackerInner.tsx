"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { io, Socket } from "socket.io-client";

// Fix Leaflet's default marker icon issue in NextJS
delete (L.Icon.Default.prototype as any)._getIconUrl;

const driverIcon = new L.Icon({
    iconUrl: "https://img.icons8.com/color/48/car--v1.png",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
});

const destIcon = new L.Icon({
    iconUrl: "https://img.icons8.com/color/48/marker--v1.png",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
});

// Helper component to auto-fit bounds
const AutoFitBounds = ({ bounds }: { bounds: L.LatLngBounds | null }) => {
    const map = useMap();
    useEffect(() => {
        if (bounds && bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], animate: true });
        }
    }, [bounds, map]);
    return null;
};

interface MapTrackerProps {
    orderId: string;
    deliveryAddress: { street: string; city: string; state: string; zip: string; country: string };
    initialDriverLocation?: { lat: number; lng: number };
}

export default function MapTrackerInner({ orderId, deliveryAddress, initialDriverLocation }: MapTrackerProps) {
    const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(initialDriverLocation || null);
    const [destLocation, setDestLocation] = useState<{ lat: number; lng: number } | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // Geocode destination location on mount
    useEffect(() => {
        const addressString = `${deliveryAddress.street}, ${deliveryAddress.city}, ${deliveryAddress.state} ${deliveryAddress.zip}, ${deliveryAddress.country}`;
        const geocode = async () => {
            try {
                const query = encodeURIComponent(addressString);
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`);
                const data = await res.json();
                if (data && data.length > 0) {
                    setDestLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
                } else {
                    // Fallback to a random destination near Kolkata if address is totally fake
                    setDestLocation({ lat: 22.58, lng: 88.35 });
                }
            } catch (err) {
                console.error("Geocoding failed", err);
                setDestLocation({ lat: 22.58, lng: 88.35 });
            }
        };
        geocode();
    }, [deliveryAddress]);

    // Socket setup for real-time driver movement
    useEffect(() => {
        const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
        // Just stripping /api to get base URL
        const baseURL = API.replace('/api', '');
        
        const socket = io(baseURL, { transports: ["websocket"] });
        socketRef.current = socket;

        // Join customer order tracking room
        socket.emit("track:order", { orderId });

        socket.on("driver:location", (data: { lat: number; lng: number }) => {
            setDriverLocation({ lat: data.lat, lng: data.lng });
        });

        return () => {
            socket.disconnect();
        };
    }, [orderId]);

    // Compute bounding box containing driver and destination
    let bounds: L.LatLngBounds | null = null;
    if (driverLocation && destLocation) {
        bounds = L.latLngBounds([driverLocation, destLocation]);
    } else if (driverLocation) {
        bounds = L.latLngBounds([driverLocation]);
    } else if (destLocation) {
        bounds = L.latLngBounds([destLocation]);
    }

    if (!driverLocation && !destLocation) {
        return (
            <div style={{ height: "300px", background: "rgba(255,255,255,0.03)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                🗺️ Waiting for location data...
            </div>
        );
    }

    // Default center
    const center = driverLocation || destLocation || { lat: 22.5726, lng: 88.3639 };

    return (
        <div style={{ width: "100%", height: "340px", borderRadius: "16px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)" }}>
            <MapContainer center={center} zoom={13} style={{ width: "100%", height: "100%", background: "#1a1a1a" }}>
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
                />
                
                <AutoFitBounds bounds={bounds} />

                {driverLocation && (
                    <Marker position={driverLocation} icon={driverIcon}>
                        <Popup>Driver's Live Location</Popup>
                    </Marker>
                )}

                {destLocation && (
                    <Marker position={destLocation} icon={destIcon}>
                        <Popup>Delivery Destination</Popup>
                    </Marker>
                )}

                {driverLocation && destLocation && (
                    <Polyline 
                        positions={[driverLocation, destLocation]} 
                        pathOptions={{ color: "#3b82f6", weight: 3, dashArray: "10, 10" }} 
                    />
                )}
            </MapContainer>
        </div>
    );
}
