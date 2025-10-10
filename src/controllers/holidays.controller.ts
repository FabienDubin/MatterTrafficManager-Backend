import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger.config';

/**
 * Controller pour les jours fériés français
 * Proxy vers l'API officielle data.gouv.fr
 */
export class HolidaysController {
  /**
   * Récupère les jours fériés français pour une année donnée
   * GET /api/v1/holidays/:year
   */
  async getHolidays(
    req: Request<{ year: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { year } = req.params;
      
      // Valider l'année
      const yearNumber = parseInt(year, 10);
      if (isNaN(yearNumber) || yearNumber < 2020 || yearNumber > 2030) {
        res.status(400).json({
          success: false,
          error: 'Année invalide. Doit être entre 2020 et 2030.',
        });
        return;
      }

      logger.info(`Récupération des jours fériés pour l'année ${year}`);

      // Appel à l'API officielle data.gouv.fr
      const apiUrl = `https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        logger.error(`Erreur API data.gouv.fr: ${response.status} ${response.statusText}`);
        res.status(502).json({
          success: false,
          error: 'Service des jours fériés temporairement indisponible',
        });
        return;
      }

      const holidays = await response.json();
      
      logger.info(`${Object.keys(holidays).length} jours fériés récupérés pour ${year}`);

      res.json({
        success: true,
        data: holidays,
        meta: {
          year: yearNumber,
          count: Object.keys(holidays).length,
          source: 'calendrier.api.gouv.fr',
        },
      });

    } catch (error) {
      logger.error('Erreur lors de la récupération des jours fériés:', error);
      next(error);
    }
  }
}

export const holidaysController = new HolidaysController();