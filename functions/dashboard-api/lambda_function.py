import json
import boto3
import os
from datetime import datetime, timedelta
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
INCIDENTS_TABLE = os.environ['INCIDENTS_TABLE']

def lambda_handler(event, context):
    print(f"API Request: {json.dumps(event, default=str)}")
    
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }
    
    try:
        path = event.get('path', '')
        method = event.get('httpMethod', '')
        
        if method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': headers,
                'body': ''
            }
        
        if path == '/incidents' and method == 'GET':
            return get_incidents(event, headers)
        
        if path.startswith('/incidents/') and method == 'GET':
            incident_id = path.split('/')[-1]
            return get_incident(incident_id, headers)
        
        if path == '/metrics' and method == 'GET':
            return get_metrics(headers)
        
        return {
            'statusCode': 404,
            'headers': headers,
            'body': json.dumps({'error': 'Not found'})
        }
        
    except Exception as error:
        print(f"API Error: {str(error)}")
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': 'Internal server error'})
        }

def get_incidents(event, headers):
    query_params = event.get('queryStringParameters') or {}
    limit = int(query_params.get('limit', 50))
    status = query_params.get('status')
    severity = query_params.get('severity')
    
    table = dynamodb.Table(INCIDENTS_TABLE)
    
    scan_kwargs = {
        'Limit': limit
    }
    
    # Add filters if specified
    filter_expressions = []
    expression_values = {}
    
    if status:
        filter_expressions.append('#status = :status')
        expression_values[':status'] = status
        scan_kwargs['ExpressionAttributeNames'] = {'#status': 'status'}
    
    if severity:
        filter_expressions.append('severity = :severity')
        expression_values[':severity'] = severity
    
    if filter_expressions:
        scan_kwargs['FilterExpression'] = ' AND '.join(filter_expressions)
        scan_kwargs['ExpressionAttributeValues'] = expression_values
    
    try:
        response = table.scan(**scan_kwargs)
        
        # Convert Decimal to float for JSON serialization
        incidents = []
        for item in response['Items']:
            incident = convert_decimals(item)
            # Parse JSON strings back to objects
            if 'details' in incident:
                try:
                    incident['details'] = json.loads(incident['details'])
                except:
                    pass
            if 'analysis' in incident:
                try:
                    incident['analysis'] = json.loads(incident['analysis'])
                except:
                    pass
            incidents.append(incident)
        
        # Sort by timestamp (most recent first)
        incidents.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'incidents': incidents,
                'count': len(incidents)
            })
        }
    except Exception as error:
        print(f"Error fetching incidents: {str(error)}")
        raise error

def get_incident(incident_id, headers):
    table = dynamodb.Table(INCIDENTS_TABLE)
    
    try:
        response = table.get_item(Key={'incident_id': incident_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': headers,
                'body': json.dumps({'error': 'Incident not found'})
            }
        
        incident = convert_decimals(response['Item'])
        
        # Parse JSON strings back to objects
        if 'details' in incident:
            try:
                incident['details'] = json.loads(incident['details'])
            except:
                pass
        if 'analysis' in incident:
            try:
                incident['analysis'] = json.loads(incident['analysis'])
            except:
                pass
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(incident)
        }
    except Exception as error:
        print(f"Error fetching incident: {str(error)}")
        raise error

def get_metrics(headers):
    try:
        table = dynamodb.Table(INCIDENTS_TABLE)
        
        # Get incidents from last 24 hours
        one_day_ago = int((datetime.utcnow() - timedelta(days=1)).timestamp())
        
        response = table.scan(
            FilterExpression='#timestamp > :timestamp',
            ExpressionAttributeNames={'#timestamp': 'timestamp'},
            ExpressionAttributeValues={':timestamp': Decimal(str(one_day_ago))}
        )
        
        incidents = [convert_decimals(item) for item in response['Items']]
        
        # Calculate metrics
        metrics = {
            'total_incidents': len(incidents),
            'open_incidents': len([i for i in incidents if i.get('status') == 'OPEN']),
            'resolved_incidents': len([i for i in incidents if i.get('status') == 'RESOLVED']),
            'critical_incidents': len([i for i in incidents if i.get('severity') == 'CRITICAL']),
            'high_incidents': len([i for i in incidents if i.get('severity') == 'HIGH']),
            'medium_incidents': len([i for i in incidents if i.get('severity') == 'MEDIUM']),
            'low_incidents': len([i for i in incidents if i.get('severity') == 'LOW']),
            'avg_resolution_time': calculate_avg_resolution_time(incidents),
            'incidents_by_source': get_incidents_by_source(incidents),
            'incidents_by_hour': get_incidents_by_hour(incidents),
            'system_health': calculate_system_health(incidents)
        }
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(metrics)
        }
    except Exception as error:
        print(f"Error calculating metrics: {str(error)}")
        raise error

def calculate_avg_resolution_time(incidents):
    resolved_incidents = [i for i in incidents if i.get('status') == 'RESOLVED' and i.get('resolved_at')]
    
    if not resolved_incidents:
        return 0
    
    total_time = 0
    for incident in resolved_incidents:
        try:
            created_at = datetime.fromisoformat(incident['created_at'].replace('Z', '+00:00'))
            resolved_at = datetime.fromisoformat(incident['resolved_at'].replace('Z', '+00:00'))
            total_time += (resolved_at - created_at).total_seconds()
        except:
            continue
    
    return round(total_time / len(resolved_incidents) / 60) if resolved_incidents else 0  # Minutes

def get_incidents_by_source(incidents):
    sources = {}
    for incident in incidents:
        source = incident.get('source', 'unknown')
        sources[source] = sources.get(source, 0) + 1
    return sources

def get_incidents_by_hour(incidents):
    hours = {}
    now = datetime.utcnow()
    
    # Initialize last 24 hours
    for i in range(23, -1, -1):
        hour = now - timedelta(hours=i)
        hour_key = hour.strftime('%H:00')
        hours[hour_key] = 0
    
    # Count incidents by hour
    for incident in incidents:
        try:
            incident_time = datetime.fromisoformat(incident['created_at'].replace('Z', '+00:00'))
            hour_key = incident_time.strftime('%H:00')
            if hour_key in hours:
                hours[hour_key] += 1
        except:
            continue
    
    return hours

def calculate_system_health(incidents):
    open_incidents = [i for i in incidents if i.get('status') == 'OPEN']
    critical_count = len([i for i in open_incidents if i.get('severity') == 'CRITICAL'])
    high_count = len([i for i in open_incidents if i.get('severity') == 'HIGH'])
    
    if critical_count > 0:
        return 'CRITICAL'
    if high_count > 2:
        return 'DEGRADED'
    if high_count > 0:
        return 'WARNING'
    return 'HEALTHY'

def convert_decimals(obj):
    """Convert DynamoDB Decimal objects to float for JSON serialization"""
    if isinstance(obj, list):
        return [convert_decimals(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_decimals(value) for key, value in obj.items()}
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj
