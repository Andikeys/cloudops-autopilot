// AI-powered incident analysis module
// In production, this would integrate with AWS Bedrock or OpenAI

const ANALYSIS_TEMPLATES = {
    'aws.ec2': {
        'terminated': {
            summary: 'EC2 instance unexpectedly terminated',
            causes: ['Instance failure', 'Auto Scaling action', 'Manual termination', 'Spot instance interruption'],
            recommendations: [
                'Check CloudWatch logs for error messages',
                'Verify Auto Scaling group configuration',
                'Review instance health checks',
                'Consider using Reserved Instances for critical workloads'
            ]
        },
        'stopped': {
            summary: 'EC2 instance stopped',
            causes: ['Manual stop', 'System maintenance', 'Instance failure', 'Resource constraints'],
            recommendations: [
                'Check instance status and system logs',
                'Verify if stop was intentional',
                'Monitor for automatic restart',
                'Review instance sizing and resource usage'
            ]
        }
    },
    'aws.rds': {
        'failure': {
            summary: 'RDS database failure detected',
            causes: ['Connection limit exceeded', 'Storage full', 'Parameter group issues', 'Network connectivity'],
            recommendations: [
                'Check database connection count',
                'Monitor storage utilization',
                'Review parameter group settings',
                'Verify security group rules'
            ]
        }
    },
    'aws.lambda': {
        'error': {
            summary: 'Lambda function execution error',
            causes: ['Code errors', 'Timeout', 'Memory limit', 'Permission issues'],
            recommendations: [
                'Review function logs in CloudWatch',
                'Check function timeout settings',
                'Monitor memory usage',
                'Verify IAM permissions'
            ]
        }
    },
    'aws.s3': {
        'error': {
            summary: 'S3 service error detected',
            causes: ['Permission denied', 'Bucket policy issues', 'Network connectivity', 'Service limits'],
            recommendations: [
                'Check bucket policies and ACLs',
                'Verify IAM permissions',
                'Monitor request rates',
                'Review CloudTrail logs'
            ]
        }
    }
};

async function analyzeIncident(source, eventType, details) {
    console.log(`Analyzing incident: ${source} - ${eventType}`);
    
    // Simulate AI analysis delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get base analysis template
    const sourceTemplates = ANALYSIS_TEMPLATES[source] || {};
    const eventKey = findEventKey(eventType, details);
    const template = sourceTemplates[eventKey] || getGenericAnalysis(source, eventType);
    
    // Enhance analysis with specific details
    const analysis = {
        summary: template.summary,
        severity_reasoning: generateSeverityReasoning(source, eventType, details),
        root_causes: template.causes || ['Unknown cause - requires investigation'],
        recommendations: template.recommendations || ['Monitor the situation', 'Check service logs'],
        impact_assessment: assessImpact(source, eventType, details),
        next_steps: generateNextSteps(source, eventType),
        confidence_score: calculateConfidenceScore(source, eventType, details)
    };
    
    return analysis;
}

function findEventKey(eventType, details) {
    if (eventType.toLowerCase().includes('terminated') || details.state === 'terminated') return 'terminated';
    if (eventType.toLowerCase().includes('stopped') || details.state === 'stopped') return 'stopped';
    if (eventType.toLowerCase().includes('failure') || eventType.toLowerCase().includes('error')) return 'failure';
    if (details.errorType) return 'error';
    return 'default';
}

function getGenericAnalysis(source, eventType) {
    return {
        summary: `${source} service event detected: ${eventType}`,
        causes: ['Service-specific issue', 'Configuration problem', 'Resource constraints'],
        recommendations: [
            'Check service-specific logs',
            'Review recent configuration changes',
            'Monitor resource utilization',
            'Consult AWS service documentation'
        ]
    };
}

function generateSeverityReasoning(source, eventType, details) {
    if (source === 'aws.ec2' && details.state === 'terminated') {
        return 'Critical: Instance termination can cause service outages and data loss';
    }
    if (source === 'aws.rds' && eventType.includes('failure')) {
        return 'Critical: Database failures directly impact application availability';
    }
    if (source === 'aws.lambda' && details.errorType) {
        return 'High: Function errors can disrupt serverless application workflows';
    }
    return 'Medium: Event requires monitoring but may not immediately impact services';
}

function assessImpact(source, eventType, details) {
    const impacts = [];
    
    if (source === 'aws.ec2') {
        impacts.push('Potential service downtime');
        impacts.push('Application unavailability');
        if (details.state === 'terminated') impacts.push('Possible data loss');
    }
    
    if (source === 'aws.rds') {
        impacts.push('Database connectivity issues');
        impacts.push('Application data access problems');
        impacts.push('Potential transaction failures');
    }
    
    if (source === 'aws.lambda') {
        impacts.push('Serverless function failures');
        impacts.push('API endpoint disruptions');
        impacts.push('Workflow interruptions');
    }
    
    return impacts.length > 0 ? impacts : ['Impact assessment pending'];
}

function generateNextSteps(source, eventType) {
    const steps = [
        'Monitor incident status',
        'Check related AWS service health',
        'Review CloudWatch metrics and alarms'
    ];
    
    if (source === 'aws.ec2') {
        steps.push('Verify instance replacement if needed');
        steps.push('Check Auto Scaling group status');
    }
    
    if (source === 'aws.rds') {
        steps.push('Test database connectivity');
        steps.push('Review database performance metrics');
    }
    
    return steps;
}

function calculateConfidenceScore(source, eventType, details) {
    let score = 0.7; // Base confidence
    
    // Higher confidence for well-known event patterns
    if (ANALYSIS_TEMPLATES[source]) score += 0.2;
    if (details && Object.keys(details).length > 2) score += 0.1;
    
    return Math.min(score, 1.0);
}

module.exports = {
    analyzeIncident
};
