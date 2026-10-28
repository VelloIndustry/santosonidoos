// Exact descriptions reviewed against the live ledger on 2026-10-28.
// Changes categories only; retain an audit trail and do not rewrite amounts or dates.
const corrections = {
  'FIRST HALF FOR CDS': 'Merchandise Production',
  '2ND HALF GD FOR CDS': 'Merchandise Production',
  'GD FIRST HALF CDS': 'Merchandise Production',
  'NEW IPHONE FAKER AFTER BEING ROBBED :(': 'Equipment Purchase',
  'SALARY SOCIAL MEDIA SEPTEMBER': 'Other Salaries',
  'SPLICE AUGUST': 'Software & Plugins',
  'SPLICE JULY': 'Software & Plugins',
  'SPLICE JUNE': 'Software & Plugins',
  'GYM AUGUST': 'Personal Expenses',
  'GYM JULY': 'Personal Expenses',
  'INTERNET AUGUST': 'Internet',
  'CAMPAMENTO BOGOTA WARNER': 'Travel',
  'AUDIO TECHNICA HEADPHONES': 'Equipment',
  'SALARIO FAKER AGOSTO': 'Javier Salary',
  'SALARIO JULIA AGOSTO': 'Other Salaries',
  'NOFACE SALARY': 'Other Salaries',
  'SCARLETT AUDIO INTERFACE': 'Equipment',
  'AC MANTEINANCE': 'Equipment Repair',
  'LAVADO ALFOMBRAS SSS': 'Utilities',
  'CLOTHING - ROPA ARTISTA': 'Wardrobe',
  'CAPCUT SUB AUGUST': 'Software & Plugins',
  'CAPCUT SUB JULY': 'Software & Plugins',
  'SHOES VISUALIZERS CHAMBA MENTALITY': 'Wardrobe',
  'PAYMENT COLORING VISUALIZERS': 'Music Video',
  'PAYMENT NO FACE VISUALIZERS': 'Music Video',
  'FAKER MOM SUPPORT AUGUST': 'Family Support',
  'PAYMENT DALCONN VISUALIZER': 'Music Video',
  'ARTE CHAMBA MENTALITY ALBUM': 'Marketing & Promo',
  'IPHONE 17 PROMAX': 'Equipment Purchase',
  'BUNDLE FOR NEW ARTIST': 'Production Fee',
  'FAKER DAD SUPPORT': 'Family Support',
  'VENEZUELA TRIP DONATION': 'Donations',
  'JAVIER SALARY JULY': 'Javier Salary',
  'DONATION VENEZUELA': 'Donations',
  'VIDEOCLIP FELIX HERNANDEZ': 'Music Video',
  'CHAMBA MENTALITY CHAINS FOR SELLING': 'Merchandise Production',
  'PART OF A PROJECT IM MAKING FOR AN ARTIST': 'Production Fee',
  'FAKER SALARY JUNE': 'Javier Salary',
  'VISUALIZER': 'Visualizer / Lyric Video',
  'VENEZUELA TOUR AS DJ FOR APACHE': 'Production Fee',
  'SANTO SONIDO INCOMES OF MAY': 'Studio Rental',
  'JUNE RENT': 'Studio Rent',
  'VIDEO + ARTE POR SI NO HA QUEDADO CLARO': 'Music Video',
  'FAKER SALARY MAY': 'Javier Salary',
  'RENT MAY STUDIO': 'Studio Rent',
  'CAMERA COST - BODY + LENSE + RIG + SCREEN + MEMORY': 'Equipment Purchase',
};
exports.corrections = corrections;
exports.up = async client => {
  await client.query(`CREATE TABLE IF NOT EXISTS budget_category_corrections (
    entry_id INTEGER PRIMARY KEY, previous_category TEXT, corrected_category TEXT NOT NULL,
    corrected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  for (const [description, category] of Object.entries(corrections)) {
    await client.query(`WITH changed AS (
      SELECT id, category FROM budget_entries
      WHERE UPPER(BTRIM(description)) = $1 AND date >= '2026-05-01' AND date <= '2026-10-28'
        AND category IS DISTINCT FROM $2
    ), recorded AS (
      INSERT INTO budget_category_corrections (entry_id, previous_category, corrected_category)
      SELECT id, category, $2 FROM changed ON CONFLICT (entry_id) DO NOTHING RETURNING entry_id
    ) UPDATE budget_entries SET category=$2, updated_at=NOW() WHERE id IN (SELECT entry_id FROM recorded)`, [description, category]);
  }
};
