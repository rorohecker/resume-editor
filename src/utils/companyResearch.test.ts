import { describe, expect, it } from 'vitest';
import {
  extractCompanyAndRole,
  formatCompanyResearchForPrompt,
  localCompanyRoleResearch,
} from './companyResearch';

describe('extractCompanyAndRole', () => {
  it('prefers application hints when provided', () => {
    const result = extractCompanyAndRole(
      'We are hiring a Software Engineer to build APIs.',
      { companyName: 'Acme Corp', targetRole: 'Backend Engineer' },
    );
    expect(result.companyName).toBe('Acme Corp');
    expect(result.roleTitle).toBe('Backend Engineer');
  });

  it('parses company and role from a typical JD', () => {
    const result = extractCompanyAndRole(
      'Company: Stripe\nPosition: Senior Product Manager\nWe build financial infrastructure.',
    );
    expect(result.companyName).toMatch(/Stripe/i);
    expect(result.roleTitle).toMatch(/Product Manager/i);
  });
});

describe('localCompanyRoleResearch', () => {
  it('builds a usable brief from JD-only when no sources exist', () => {
    const research = localCompanyRoleResearch(
      'Company: Notion\nRole: Software Engineer\nBuild collaborative products with React and TypeScript.',
    );
    expect(research.companyName).toMatch(/Notion/i);
    expect(research.roleTitle.length).toBeGreaterThan(0);
    expect(research.hiringSignals.length).toBeGreaterThan(0);
    expect(research.usefulForTailoring.length).toBeGreaterThan(0);
    expect(formatCompanyResearchForPrompt(research)).toContain('COMPANY & ROLE RESEARCH');
  });

  it('includes public snippets when provided', () => {
    const research = localCompanyRoleResearch(
      'Join Acme as a Data Analyst.',
      { companyName: 'Acme' },
      [
        {
          title: 'Acme',
          url: 'https://example.com/acme',
          snippet: 'Acme builds analytics tools for mid-market teams.',
        },
      ],
    );
    expect(research.companyOverview).toMatch(/analytics/i);
    expect(research.sources).toHaveLength(1);
  });
});
