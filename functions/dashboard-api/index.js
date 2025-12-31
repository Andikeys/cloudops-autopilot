const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE;

exports.handler = async (event) => {
    console.log('API Request:', JSON.stringify(event, null, 2));
    
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    
    try {
        const path = event.path;
        const method = event.httpMethod;
        
        if (method === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: headers,
                body: ''
            };
        }
        
        if (path === '/incidents' && method === 'GET') {
            return await getIncidents(event, headers);
        }
        
        if (path.startsWith('/incidents/') && method === 'GET') {
            const incidentId = path.split('/')[2];
            return await getIncident(incidentId, headers);
        }
        
        if (path === '/metrics' && method === 'GET') {
            return await getMetrics(headers);
        }
        
        return {
            statusCode: 404,
            headers: headers,
            body: JSON.stringify({ error: 'Not found' })
        };
        
    } catch (error) {
        console.error('API Error:', error);
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
};

async function getIncidents(event, headers) {
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 50;
    const status = queryParams.status;
    const severity = queryParams.severity;
    
    let params = {
        TableName: INCIDENTS_TABLE,
        Limit: limit,
        ScanIndexForward: false // Most recent first
    };
    
    // Add filters if specified
    if (status || severity) {
        params.FilterExpression = '';
        params.ExpressionAttributeValues = {};
        
        if (status) {
            params.FilterExpression += '#status = :status';
            params.ExpressionAttributeNames = { '#status': 'status' };
            params.ExpressionAttributeValues[':status'] = status;
        }
        
        if (severity) {
            if (params.FilterExpression) params.FilterExpression += ' AND ';
            params.FilterExpression += 'severity = :severity';
            params.ExpressionAttributeValues[':severity'] = severity;
        }
    }
    
    try {
        const result = await dynamodb.scan(params).promise();
        
        // Sort by timestamp (most recent first)
        const incidents = result.Items.sort((a, b) => b.timestamp - a.timestamp);
        
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({
                incidents: incidents,
                count: incidents.length,
                lastEvaluatedKey: result.LastEvaluatedKey
            })
        };
    } catch (error) {
        console.error('Error fetching incidents:', error);
        throw error;
    }
}

async function getIncident(incidentId, headers) {
    const params = {
        TableName: INCIDENTS_TABLE,
        Key: { incident_id: incidentId }
    };
    
    try {
        const result = await dynamodb.get(params).promise();
        
        if (!result.Item) {
            return {
                statusCode: 404,
                headers: headers,
                body: JSON.stringify({ error: 'Incident not found' })
            };
        }
        
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify(result.Item)
        };
    } catch (error) {
        console.error('Error fetching incident:', error);
        throw error;
    }
}

async function getMetrics(headers) {
    try {
        // Get incidents from last 24 hours
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        
        const params = {
            TableName: INCIDENTS_TABLE,
            FilterExpression: '#timestamp > :timestamp',
            ExpressionAttributeNames: { '#timestamp': 'timestamp' },
            ExpressionAttributeValues: { ':timestamp': oneDayAgo }
        };
        
        const result = await dynamodb.scan(params).promise();
        const incidents = result.Items;
        
        // Calculate metrics
        const metrics = {
            total_incidents: incidents.length,
            open_incidents: incidents.filter(i => i.status === 'OPEN').length,
            resolved_incidents: incidents.filter(i => i.status === 'RESOLVED').length,
            critical_incidents: incidents.filter(i => i.severity === 'CRITICAL').length,
            high_incidents: incidents.filter(i => i.severity === 'HIGH').length,
            medium_incidents: incidents.filter(i => i.severity === 'MEDIUM').length,
            low_incidents: incidents.filter(i => i.severity === 'LOW').length,
            avg_resolution_time: calculateAvgResolutionTime(incidents),
            incidents_by_source: getIncidentsBySource(incidents),
            incidents_by_hour: getIncidentsByHour(incidents),
            system_health: calculateSystemHealth(incidents)
        };
        
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify(metrics)
        };
    } catch (error) {
        console.error('Error calculating metrics:', error);
        throw error;
    }
}

function calculateAvgResolutionTime(incidents) {
    const resolvedIncidents = incidents.filter(i => i.status === 'RESOLVED' && i.resolved_at);
    
    if (resolvedIncidents.length === 0) return 0;
    
    const totalTime = resolvedIncidents.reduce((sum, incident) => {
        const createdAt = new Date(incident.created_at).getTime();
        const resolvedAt = new Date(incident.resolved_at).getTime();
        return sum + (resolvedAt - createdAt);
    }, 0);
    
    return Math.round(totalTime / resolvedIncidents.length / 1000 / 60); // Minutes
}

function getIncidentsBySource(incidents) {
    const sources = {};
    incidents.forEach(incident => {
        const source = incident.source || 'unknown';
        sources[source] = (sources[source] || 0) + 1;
    });
    return sources;
}

function getIncidentsByHour(incidents) {
    const hours = {};
    const now = new Date();
    
    // Initialize last 24 hours
    for (let i = 23; i >= 0; i--) {
        const hour = new Date(now.getTime() - (i * 60 * 60 * 1000));
        const hourKey = hour.getHours().toString().padStart(2, '0') + ':00';
        hours[hourKey] = 0;
    }
    
    // Count incidents by hour
    incidents.forEach(incident => {
        const incidentTime = new Date(incident.created_at);
        const hourKey = incidentTime.getHours().toString().padStart(2, '0') + ':00';
        if (hours.hasOwnProperty(hourKey)) {
            hours[hourKey]++;
        }
    });
    
    return hours;
}

function calculateSystemHealth(incidents) {
    const criticalCount = incidents.filter(i => i.severity === 'CRITICAL' && i.status === 'OPEN').length;
    const highCount = incidents.filter(i => i.severity === 'HIGH' && i.status === 'OPEN').length;
    
    if (criticalCount > 0) return 'CRITICAL';
    if (highCount > 2) return 'DEGRADED';
    if (highCount > 0) return 'WARNING';
    return 'HEALTHY';
}
