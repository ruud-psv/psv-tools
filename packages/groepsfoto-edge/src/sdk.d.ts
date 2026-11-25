/** Het deel van de Bunny Edge Scripting SDK dat dit script gebruikt. */
declare module "https://esm.sh/@bunny.net/edgescript-sdk@0.13.0" {
  export const net: {
    http: {
      serve(handler: (request: Request) => Response | Promise<Response>): unknown;
    };
  };
}

/** De runtime van Bunny is gebaseerd op Deno. */
declare const Deno: { env: { get(naam: string): string | undefined } } | undefined;
