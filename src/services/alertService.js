import { FatiguePredictor } from './prediction.js';

export class AlertService {
  constructor(config = {}) {
    this.predictor = new FatiguePredictor();
    this.alertChannels = config.channels || ['slack', 'email'];
    this.slackWebhook = config.slackWebhook;
    this.emailConfig = config.emailConfig;
  }

  async checkAndAlert(creative, currentMetrics, previousPrediction) {
    const prediction = this.predictor.predict(currentMetrics);

    const shouldAlert = this.predictor.shouldAlert(prediction, previousPrediction);

    if (shouldAlert) {
      const alert = this.formatAlert(creative, prediction, currentMetrics);
      await this.sendAlert(alert);
      return { alert, prediction };
    }

    return { alert: null, prediction };
  }

  formatAlert(creative, prediction, currentMetrics) {
    const severityMap = {
      healthy: 'info',
      warning: 'warning',
      fatigued: 'critical',
    };

    const typeMap = {
      healthy: 'performance_recovered',
      warning: 'fatigue_warning',
      fatigued: 'fatigue_detected',
    };

    return {
      id: `alert_${creative.id}_${Date.now()}`,
      creativeId: creative.id,
      platform: creative.platform,
      creativeName: creative.name,
      type: typeMap[prediction.status],
      severity: severityMap[prediction.status],
      prediction,
      currentMetrics: currentMetrics[currentMetrics.length - 1],
      message: this.generateMessage(creative, prediction),
      createdAt: new Date().toISOString(),
    };
  }

  generateMessage(creative, prediction) {
    const messages = {
      healthy: `${creative.name} 表现良好，预计可继续使用 ${prediction.daysRemaining || '?')} 天`,
      warning: `${creative.name} 出现疲劳迹象，建议准备新素材。剩余寿命约 ${prediction.daysRemaining || '?'} 天`,
      fatigued: `${creative.name} 已疲劳，建议立即暂停或更换素材`,
    };
    return messages[prediction.status];
  }

  async sendAlert(alert) {
    const results = [];

    if (this.alertChannels.includes('slack') && this.slackWebhook) {
      results.push(await this.sendSlack(alert));
    }

    if (this.alertChannels.includes('email') && this.emailConfig) {
      results.push(await this.sendEmail(alert));
    }

    return results;
  }

  async sendSlack(alert) {
    const payload = {
      text: `*Ad Creative Alert*`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🚨 ${alert.type.replace('_', ' ').toUpperCase()}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Platform:*\n${alert.platform}` },
            { type: 'mrkdwn', text: `*Creative:*\n${alert.creativeName}` },
            { type: 'mrkdwn', text: `*Severity:*\n${alert.severity}` },
            { type: 'mrkdwn', text: `*Days Remaining:*\n${alert.prediction.daysRemaining || 'Unknown'}` },
          ],
        },
        { type: 'section', text: { type: 'mrkdwn', text: alert.message } },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Generated at ${alert.createdAt}` }],
        },
      ],
    };

    const response = await fetch(this.slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return response.ok;
  }

  async sendEmail(alert) {
    const { createTransport } = await import('nodemailer');
    const transporter = createTransport({
      host: this.emailConfig.host,
      port: this.emailConfig.port,
      secure: false,
      auth: {
        user: this.emailConfig.user,
        pass: this.emailConfig.pass,
      },
    });

    const mailOptions = {
      from: this.emailConfig.from || this.emailConfig.user,
      to: this.emailConfig.to,
      subject: `[${alert.severity.toUpperCase()}] Ad Creative Alert - ${alert.creativeName}`,
      html: this.formatEmailHtml(alert),
    };

    const result = await transporter.sendMail(mailOptions);
    return result.accepted;
  }

  formatEmailHtml(alert) {
    return `
      <h2>Ad Creative Alert</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Platform</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${alert.platform}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Creative</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${alert.creativeName}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Status</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${alert.prediction.status}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Days Remaining</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${alert.prediction.daysRemaining || 'Unknown'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Recommendation</strong></td>
          <td style="padding: 8px; border: 1px solid #ddd;">${alert.prediction.recommendation}</td>
        </tr>
      </table>
      <p><strong>Message:</strong> ${alert.message}</p>
      <p><small>Generated at ${alert.createdAt}</small></p>
    `;
  }
}

export default AlertService;
