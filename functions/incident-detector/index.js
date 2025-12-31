const AWS = require('aws-sdk');
const { analyzeIncident } = require('./ai-analyzer');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();

const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {
        // Extract event details
        const eventSource = event.source;
        const eventType = event['detail-type'];
        const eventDetail = event.detail;
        const timestamp = new Date().getTime();
        
        // Determine incident severity
        const severity = determineSeverity(eventSource, eventType, eventDetail);
        
        // Skip low-severity events to reduce noise
        if (severity === 'LOW') {
            console.log('Skipping low-severity event');
            return { statusCode: 200, body: 'Event processed - low severity' };
        }
        
        // Generate incident ID
        const incidentId = `${eventSource}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Analyze incident with AI
        const analysis = await analyzeIncident(eventSource, eventType, eventDetail);
        
        // Create incident record
        const incident = {
            incident_id: incidentId,
            timestamp: timestamp,
            source: eventSource,
            event_type: eventType,
            severity: severity,
            status: 'OPEN',
            details: eventDetail,
            analysis: analysis,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        // Store in DynamoDB
        await dynamodb.put({
            TableName: INCIDENTS_TABLE,
            Item: incident
        }).promise();
        
        // Send notification for high/critical incidents
        if (severity === 'HIGH' || severity === 'CRITICAL') {
            await sendNotification(incident);
        }
        
        console.log(`Incident ${incidentId} created with severity ${severity}`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Incident processed successfully',
                incidentId: incidentId,
                severity: severity
            })
        };
        
    } catch (error) {
        console.error('Error processing incident:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to process incident' })
        };
    }
};

function determineSeverity(source, eventType, detail) {
    // Critical incidents
    if (source === 'aws.ec2' && detail.state === 'terminated') return 'CRITICAL';
    if (source === 'aws.rds' && eventType.includes('failure')) return 'CRITICAL';
    if (source === 'aws.lambda' && detail.errorType) return 'HIGH';
    
    // High incidents
    if (source === 'aws.ec2' && detail.state === 'stopped') return 'HIGH';
    if (source === 'aws.cloudwatch' && detail.state?.value === 'ALARM') return 'HIGH';
    if (source === 'aws.s3' && eventType.includes('error')) return 'HIGH';
    
    // Medium incidents
    if (source === 'aws.ec2' && detail.state === 'stopping') return 'MEDIUM';
    if (source === 'aws.autoscaling') return 'MEDIUM';
    
    return 'LOW';
}

async function sendNotification(incident) {
    const message = {
        default: `🚨 CloudOps Alert: ${incident.severity} Incident Detected`,
        email: formatEmailNotification(incident),
        sms: formatSMSNotification(incident)
    };
    
    const params = {
        TopicArn: SNS_TOPIC_ARN,
        Message: JSON.stringify(message),
        MessageStructure: 'json',
        Subject: `CloudOps Alert: ${incident.severity} - ${incident.source}`
    };
    
    try {
        await sns.publish(params).promise();
        console.log('Notification sent successfully');
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

function formatEmailNotification(incident) {
    return `
CloudOps Autopilot - Incident Alert

Incident ID: ${incident.incident_id}
Severity: ${incident.severity}
Source: ${incident.source}
Event Type: ${incident.event_type}
Time: ${incident.created_at}

Details:
${JSON.stringify(incident.details, null, 2)}

AI Analysis:
${incident.analysis.summary}

Recommended Actions:
${incident.analysis.recommendations.join('\n')}

Dashboard: [View in Dashboard]
    `.trim();
}

function formatSMSNotification(incident) {
    return `CloudOps Alert: ${incident.severity} incident in ${incident.source}. ID: ${incident.incident_id}. Check dashboard for details.`;
}
