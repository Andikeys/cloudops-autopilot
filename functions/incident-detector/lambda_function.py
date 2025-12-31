import json
import boto3
import os
import time
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')

INCIDENTS_TABLE = os.environ['INCIDENTS_TABLE']
SNS_TOPIC_ARN = os.environ['SNS_TOPIC_ARN']

def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event, default=str)}")
    
    try:
        # Extract event details
        event_source = event.get('source', 'unknown')
        event_type = event.get('detail-type', 'unknown')
        event_detail = event.get('detail', {})
        timestamp = int(time.time())
        
        # Determine incident severity
        severity = determine_severity(event_source, event_type, event_detail)
        
        # Skip low-severity events to reduce noise
        if severity == 'LOW':
            print('Skipping low-severity event')
            return {'statusCode': 200, 'body': 'Event processed - low severity'}
        
        # Generate incident ID
        incident_id = f"{event_source}-{timestamp}-{hash(str(event_detail)) % 1000000:06d}"
        
        # Analyze incident with AI
        analysis = analyze_incident(event_source, event_type, event_detail)
        
        # Create incident record
        incident = {
            'incident_id': incident_id,
            'timestamp': Decimal(str(timestamp)),
            'source': event_source,
            'event_type': event_type,
            'severity': severity,
            'status': 'OPEN',
            'details': json.dumps(event_detail),
            'analysis': json.dumps(analysis),
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Store in DynamoDB
        table = dynamodb.Table(INCIDENTS_TABLE)
        table.put_item(Item=incident)
        
        # Send notification for high/critical incidents
        if severity in ['HIGH', 'CRITICAL']:
            send_notification(incident)
        
        print(f"Incident {incident_id} created with severity {severity}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Incident processed successfully',
                'incidentId': incident_id,
                'severity': severity
            })
        }
        
    except Exception as error:
        print(f"Error processing incident: {str(error)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Failed to process incident'})
        }

def determine_severity(source, event_type, detail):
    # Critical incidents
    if source == 'aws.ec2' and detail.get('state') == 'terminated':
        return 'CRITICAL'
    if source == 'aws.rds' and 'failure' in event_type.lower():
        return 'CRITICAL'
    if source == 'aws.lambda' and detail.get('errorType'):
        return 'HIGH'
    
    # High incidents
    if source == 'aws.ec2' and detail.get('state') == 'stopped':
        return 'HIGH'
    if source == 'aws.cloudwatch' and detail.get('state', {}).get('value') == 'ALARM':
        return 'HIGH'
    if source == 'aws.s3' and 'error' in event_type.lower():
        return 'HIGH'
    
    # Medium incidents
    if source == 'aws.ec2' and detail.get('state') == 'stopping':
        return 'MEDIUM'
    if source == 'aws.autoscaling':
        return 'MEDIUM'
    
    return 'LOW'

def analyze_incident(source, event_type, details):
    analysis_templates = {
        'aws.ec2': {
            'terminated': {
                'summary': 'EC2 instance unexpectedly terminated',
                'causes': ['Instance failure', 'Auto Scaling action', 'Manual termination', 'Spot instance interruption'],
                'recommendations': [
                    'Check CloudWatch logs for error messages',
                    'Verify Auto Scaling group configuration',
                    'Review instance health checks',
                    'Consider using Reserved Instances for critical workloads'
                ]
            },
            'stopped': {
                'summary': 'EC2 instance stopped',
                'causes': ['Manual stop', 'System maintenance', 'Instance failure', 'Resource constraints'],
                'recommendations': [
                    'Check instance status and system logs',
                    'Verify if stop was intentional',
                    'Monitor for automatic restart',
                    'Review instance sizing and resource usage'
                ]
            }
        },
        'aws.rds': {
            'failure': {
                'summary': 'RDS database failure detected',
                'causes': ['Connection limit exceeded', 'Storage full', 'Parameter group issues', 'Network connectivity'],
                'recommendations': [
                    'Check database connection count',
                    'Monitor storage utilization',
                    'Review parameter group settings',
                    'Verify security group rules'
                ]
            }
        },
        'aws.lambda': {
            'error': {
                'summary': 'Lambda function execution error',
                'causes': ['Code errors', 'Timeout', 'Memory limit', 'Permission issues'],
                'recommendations': [
                    'Review function logs in CloudWatch',
                    'Check function timeout settings',
                    'Monitor memory usage',
                    'Verify IAM permissions'
                ]
            }
        }
    }
    
    # Get base analysis template
    source_templates = analysis_templates.get(source, {})
    event_key = find_event_key(event_type, details)
    template = source_templates.get(event_key, get_generic_analysis(source, event_type))
    
    # Enhance analysis with specific details
    analysis = {
        'summary': template['summary'],
        'severity_reasoning': generate_severity_reasoning(source, event_type, details),
        'root_causes': template['causes'],
        'recommendations': template['recommendations'],
        'impact_assessment': assess_impact(source, event_type, details),
        'confidence_score': calculate_confidence_score(source, event_type, details)
    }
    
    return analysis

def find_event_key(event_type, details):
    if 'terminated' in event_type.lower() or details.get('state') == 'terminated':
        return 'terminated'
    if 'stopped' in event_type.lower() or details.get('state') == 'stopped':
        return 'stopped'
    if 'failure' in event_type.lower() or 'error' in event_type.lower():
        return 'failure'
    if details.get('errorType'):
        return 'error'
    return 'default'

def get_generic_analysis(source, event_type):
    return {
        'summary': f"{source} service event detected: {event_type}",
        'causes': ['Service-specific issue', 'Configuration problem', 'Resource constraints'],
        'recommendations': [
            'Check service-specific logs',
            'Review recent configuration changes',
            'Monitor resource utilization',
            'Consult AWS service documentation'
        ]
    }

def generate_severity_reasoning(source, event_type, details):
    if source == 'aws.ec2' and details.get('state') == 'terminated':
        return 'Critical: Instance termination can cause service outages and data loss'
    if source == 'aws.rds' and 'failure' in event_type.lower():
        return 'Critical: Database failures directly impact application availability'
    if source == 'aws.lambda' and details.get('errorType'):
        return 'High: Function errors can disrupt serverless application workflows'
    return 'Medium: Event requires monitoring but may not immediately impact services'

def assess_impact(source, event_type, details):
    impacts = []
    
    if source == 'aws.ec2':
        impacts.extend(['Potential service downtime', 'Application unavailability'])
        if details.get('state') == 'terminated':
            impacts.append('Possible data loss')
    
    if source == 'aws.rds':
        impacts.extend(['Database connectivity issues', 'Application data access problems', 'Potential transaction failures'])
    
    if source == 'aws.lambda':
        impacts.extend(['Serverless function failures', 'API endpoint disruptions', 'Workflow interruptions'])
    
    return impacts if impacts else ['Impact assessment pending']

def calculate_confidence_score(source, event_type, details):
    score = 0.7  # Base confidence
    
    # Higher confidence for well-known event patterns
    if source in ['aws.ec2', 'aws.rds', 'aws.lambda']:
        score += 0.2
    if details and len(details) > 2:
        score += 0.1
    
    return min(score, 1.0)

def send_notification(incident):
    try:
        message = format_notification(incident)
        
        sns.publish(
            TopicArn=SNS_TOPIC_ARN,
            Message=message,
            Subject=f"CloudOps Alert: {incident['severity']} - {incident['source']}"
        )
        
        print('Notification sent successfully')
    except Exception as error:
        print(f'Failed to send notification: {str(error)}')

def format_notification(incident):
    analysis = json.loads(incident['analysis'])
    
    return f"""
CloudOps Autopilot - Incident Alert

Incident ID: {incident['incident_id']}
Severity: {incident['severity']}
Source: {incident['source']}
Event Type: {incident['event_type']}
Time: {incident['created_at']}

AI Analysis:
{analysis['summary']}

Recommended Actions:
{chr(10).join(f"• {rec}" for rec in analysis['recommendations'])}

Dashboard: View details in your CloudOps dashboard
    """.strip()
