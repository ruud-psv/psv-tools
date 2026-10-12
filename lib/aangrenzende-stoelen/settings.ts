/**
 * Instellingen van de tool Aangrenzende stoelen die bewust op één plek staan.
 */

/**
 * Vak, rij en stoel in de export.
 *
 * Alleen voor de testfase: zo is te controleren of de juiste mensen op de lijst
 * komen. Zet op `false` om alleen relatienummers te leveren.
 */
export const INCLUDE_SEAT_COLUMNS = true;

/**
 * Hoe lang "Maak lijst" eerst de nieuwste mutaties uit Ringside ophaalt. Bij
 * een cron per kwartier is er dan hooguit een kwartier bij te lezen, wat
 * ruim binnen deze tijd past.
 */
export const CATCH_UP_SECONDS = 25;
