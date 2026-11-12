import { gesprekkenOpslag } from "../kennisbank-gesprekken";

/** De gesprekken met de assistent, per collega bewaard. Zelfde opslag als de kennisbank-chat, eigen map. */
export const { saveGesprek, getGesprek, listGesprekken, deleteGesprek } = gesprekkenOpslag("assistent-gesprekken/");
