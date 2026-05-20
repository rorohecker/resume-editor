import type { Resume } from '@/types';
import { analyzeBullets, detectWeakLanguage } from './aiAssist';
import { estimatePageUsage, isDarkProfessionalColor } from './styleChecks';
import { collectBullets } from './resumeText';

export interface HealthScore {
  total: number; // 0–100
  breakdown: { label: string; score: number; max: number; notes: string[] }[];
}

export function computeHealthScore(resume: Resume): HealthScore {
  const bullets = collectBullets(resume);
  const analyses = analyzeBullets(resume);
  const weak = detectWeakLanguage(resume);
  const usage = estimatePageUsage(resume);

  // Each category is scored 0–max; total is the sum capped at 100.

  // 1. Action verb usage (30 pts)
  const actionPct = bullets.length === 0 ? 0 : analyses.filter((a) => a.startsWithAction).length / bullets.length;
  const actionScore = Math.round(actionPct * 30);

  // 2. Metric presence (25 pts)
  const metricPct = bullets.length === 0 ? 0 : analyses.filter((a) => a.hasMetric).length / bullets.length;
  const metricScore = Math.round(metricPct * 25);

  // 3. Weak language (15 pts — full marks if none)
  const weakPenalty = Math.min(15, weak.length * 3);
  const weakScore = 15 - weakPenalty;

  // 4. Length (15 pts — sweet spot around 70–95% usage)
  let lengthScore = 15;
  if (usage < 50) lengthScore = 8;
  else if (usage < 70) lengthScore = 12;
  else if (usage >= 70 && usage <= 95) lengthScore = 15;
  else if (usage <= 105) lengthScore = 10;
  else lengthScore = 5;

  // 5. Contact completeness (5 pts)
  const filledContacts = resume.header.contactFields.filter(
    (f) => f.visible && f.value.trim().length > 0,
  ).length;
  const contactScore = Math.min(5, filledContacts);

  // 6. ATS-friendly colors (5 pts)
  const colorOk = isDarkProfessionalColor(resume.styles.colors.body);
  const colorScore = colorOk ? 5 : 0;

  // 7. Header completeness (5 pts)
  const headerOk = resume.header.name.trim().length > 0;
  const headerScore = headerOk ? 5 : 0;

  const total = Math.min(
    100,
    actionScore + metricScore + weakScore + lengthScore + contactScore + colorScore + headerScore,
  );

  return {
    total,
    breakdown: [
      {
        label: 'Action verbs',
        score: actionScore,
        max: 30,
        notes: [
          actionPct >= 0.9
            ? 'Almost every bullet starts strong.'
            : `${Math.round(actionPct * 100)}% of bullets start with a verb from the action bank.`,
        ],
      },
      {
        label: 'Measurable impact',
        score: metricScore,
        max: 25,
        notes: [`${Math.round(metricPct * 100)}% of bullets cite a metric.`],
      },
      {
        label: 'No weak language',
        score: weakScore,
        max: 15,
        notes: [weak.length === 0 ? 'Clean — no weak phrases detected.' : `${weak.length} weak phrase(s) found.`],
      },
      {
        label: 'Page length',
        score: lengthScore,
        max: 15,
        notes: [`Estimated page usage: ${usage}%.`],
      },
      {
        label: 'Contact info',
        score: contactScore,
        max: 5,
        notes: [`${filledContacts} contact field(s) filled.`],
      },
      {
        label: 'ATS colors',
        score: colorScore,
        max: 5,
        notes: [colorOk ? 'Body text uses an ATS-safe color.' : 'Body text isn\'t dark enough for some ATS systems.'],
      },
      {
        label: 'Header',
        score: headerScore,
        max: 5,
        notes: [headerOk ? 'Name is set.' : 'Add your name to the header.'],
      },
    ],
  };
}
