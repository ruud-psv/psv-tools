import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep existing API routes working with the new App Router

  // Ticket Inzichten (XML-feed) en de Ringside-pagina zijn opgegaan in
  // Ticketing Stadion; oude links en bladwijzers komen daar uit.
  async redirects() {
    return [
      { source: "/dashboard/ticket-inzichten-new", destination: "/dashboard/ticketing-stadion", permanent: false },
      { source: "/dashboard/ticket-inzichten", destination: "/dashboard/ticketing-stadion", permanent: false },
      { source: "/dashboard/ticket-inzichten/:path*", destination: "/dashboard/ticketing-stadion", permanent: false },
    ];
  },
};

export default nextConfig;
