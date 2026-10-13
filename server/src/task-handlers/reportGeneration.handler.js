/**
 * Report Generation Handler
 * Compiles upstream metrics, outputs, and execution telemetry into a structured report.
 */
async function reportGenerationHandler(input = {}, context = {}) {
  const {
    reportTitle = 'Workflow Execution Summary',
    format = 'json',
    summaryMetrics = {},
    sections = []
  } = input;

  const generatedAt = new Date().toISOString();

  const report = {
    title: reportTitle,
    generatedAt,
    runId: context.runId || 'unknown',
    taskId: context.taskId || 'unknown',
    metrics: {
      ...summaryMetrics,
      generatedTimestamp: Date.now()
    },
    sections: sections.map(s => ({
      heading: s.heading || 'Section',
      content: s.content || ''
    }))
  };

  if (format.toLowerCase() === 'markdown') {
    let md = `# ${report.title}\n\n`;
    md += `**Generated:** ${report.generatedAt}\n`;
    md += `**Run ID:** \`${report.runId}\`\n\n`;
    md += `## Metrics\n\n`;
    for (const [k, v] of Object.entries(report.metrics)) {
      md += `- **${k}:** ${v}\n`;
    }
    md += `\n## Content\n\n`;
    for (const s of report.sections) {
      md += `### ${s.heading}\n\n${s.content}\n\n`;
    }
    return {
      format: 'markdown',
      markdownText: md,
      reportData: report
    };
  }

  return {
    format: 'json',
    reportData: report
  };
}

module.exports = { reportGenerationHandler };
