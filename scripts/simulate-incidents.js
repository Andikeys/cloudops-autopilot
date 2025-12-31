// CloudOps Autopilot - Incident Simulation Script
// Use this to generate test incidents for demo purposes

const AWS = require('aws-sdk');

// Configure AWS SDK
const eventbridge = new AWS.EventBridge({ region: process.env.AWS_REGION || 'us-east-1' });

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME || 'cloudops-autopilot-events';

// Incident templates for different AWS services
const INCIDENT_TEMPLATES = {
    ec2: [
        {
            source: 'aws.ec2',
            detailType: 'EC2 Instance State-change Notification',
            detail: {
                instanceId: 'i-1234567890abcdef0',
                state: 'terminated',
                previousState: 'running',
                reason: 'User initiated (2023-12-31 11:49:46 GMT)'
            }
        },
        {
            source: 'aws.ec2',
            detailType: 'EC2 Instance State-change Notification',
            detail: {
                instanceId: 'i-0987654321fedcba0',
                state: 'stopped',
                previousState: 'running',
                reason: 'Instance failure'
            }
        }
    ],
    rds: [
        {
            source: 'aws.rds',
            detailType: 'RDS DB Instance Event',
            detail: {
                sourceId: 'mydb-instance',
                eventCategories: ['failure'],
                message: 'Database connection limit exceeded',
                sourceType: 'db-instance'
            }
        },
        {
            source: 'aws.rds',
            detailType: 'RDS DB Cluster Event',
            detail: {
                sourceId: 'mydb-cluster',
                eventCategories: ['failover'],
                message: 'Failover completed',
                sourceType: 'db-cluster'
            }
        }
    ],
    lambda: [
        {
            source: 'aws.lambda',
            detailType: 'Lambda Function Invocation Result',
            detail: {
                functionName: 'my-critical-function',
                errorType: 'TimeoutError',
                errorMessage: 'Task timed out after 30.00 seconds',
                requestId: 'abc123-def456-ghi789'
            }
        },
        {
            source: 'aws.lambda',
            detailType: 'Lambda Function Invocation Result',
            detail: {
                functionName: 'data-processor',
                errorType: 'MemoryError',
                errorMessage: 'Process out of memory',
                requestId: 'xyz789-uvw456-rst123'
            }
        }
    ],
    s3: [
        {
            source: 'aws.s3',
            detailType: 'S3 Bucket Notification',
            detail: {
                bucketName: 'my-important-bucket',
                eventName: 's3:ObjectRemove:Delete',
                errorCode: 'AccessDenied',
                errorMessage: 'Access Denied'
            }
        }
    ],
    cloudwatch: [
        {
            source: 'aws.cloudwatch',
            detailType: 'CloudWatch Alarm State Change',
            detail: {
                alarmName: 'HighCPUUtilization',
                state: {
                    value: 'ALARM',
                    reason: 'Threshold Crossed: 1 out of the last 1 datapoints [95.0] was greater than the threshold (80.0)'
                },
                previousState: {
                    value: 'OK'
                }
            }
        }
    ]
};

async function simulateIncident(type = 'random', severity = 'random') {
    try {
        let template;
        
        if (type === 'random') {
            const types = Object.keys(INCIDENT_TEMPLATES);
            const randomType = types[Math.floor(Math.random() * types.length)];
            const templates = INCIDENT_TEMPLATES[randomType];
            template = templates[Math.floor(Math.random() * templates.length)];
        } else if (INCIDENT_TEMPLATES[type]) {
            const templates = INCIDENT_TEMPLATES[type];
            template = templates[Math.floor(Math.random() * templates.length)];
        } else {
            throw new Error(`Unknown incident type: ${type}`);
        }
        
        // Add timestamp and unique ID
        const event = {
            Source: template.source,
            DetailType: template.detailType,
            Detail: JSON.stringify({
                ...template.detail,
                timestamp: new Date().toISOString(),
                simulationId: `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            }),
            EventBusName: EVENT_BUS_NAME
        };
        
        console.log('Sending event:', JSON.stringify(event, null, 2));
        
        const result = await eventbridge.putEvents({
            Entries: [event]
        }).promise();
        
        if (result.FailedEntryCount > 0) {
            console.error('Failed to send event:', result.Entries[0].ErrorMessage);
            return false;
        }
        
        console.log(`✅ Successfully simulated ${template.source} incident`);
        return true;
        
    } catch (error) {
        console.error('Error simulating incident:', error.message);
        return false;
    }
}

async function simulateMultipleIncidents(count = 5, type = 'random', delay = 2000) {
    console.log(`🚀 Simulating ${count} incidents of type: ${type}`);
    
    for (let i = 0; i < count; i++) {
        console.log(`\n--- Incident ${i + 1}/${count} ---`);
        
        const success = await simulateIncident(type);
        
        if (!success) {
            console.error(`Failed to simulate incident ${i + 1}`);
        }
        
        // Wait between incidents (except for the last one)
        if (i < count - 1) {
            console.log(`Waiting ${delay}ms before next incident...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    console.log('\n🎉 Incident simulation complete!');
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    
    let type = 'random';
    let count = 1;
    let delay = 2000;
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--type':
                type = args[i + 1];
                i++;
                break;
            case '--count':
                count = parseInt(args[i + 1]);
                i++;
                break;
            case '--delay':
                delay = parseInt(args[i + 1]);
                i++;
                break;
            case '--help':
                console.log(`
CloudOps Autopilot - Incident Simulator

Usage: node simulate-incidents.js [options]

Options:
  --type <type>     Incident type (ec2, rds, lambda, s3, cloudwatch, random)
  --count <number>  Number of incidents to simulate (default: 1)
  --delay <ms>      Delay between incidents in milliseconds (default: 2000)
  --help           Show this help message

Examples:
  node simulate-incidents.js --type ec2 --count 3
  node simulate-incidents.js --type random --count 10 --delay 1000
  node simulate-incidents.js --type lambda

Available incident types:
  - ec2: Instance termination, stopping
  - rds: Database failures, connection issues
  - lambda: Function errors, timeouts
  - s3: Access denied, object deletion
  - cloudwatch: Alarm state changes
  - random: Random selection from all types
                `);
                return;
        }
    }
    
    // Validate inputs
    if (count < 1 || count > 50) {
        console.error('Count must be between 1 and 50');
        return;
    }
    
    if (delay < 100) {
        console.error('Delay must be at least 100ms');
        return;
    }
    
    const validTypes = [...Object.keys(INCIDENT_TEMPLATES), 'random'];
    if (!validTypes.includes(type)) {
        console.error(`Invalid type. Valid types: ${validTypes.join(', ')}`);
        return;
    }
    
    // Check AWS configuration
    try {
        const sts = new AWS.STS();
        const identity = await sts.getCallerIdentity().promise();
        console.log(`AWS Account: ${identity.Account}`);
        console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
        console.log(`Event Bus: ${EVENT_BUS_NAME}\n`);
    } catch (error) {
        console.error('AWS configuration error:', error.message);
        console.error('Please ensure AWS credentials are configured');
        return;
    }
    
    // Run simulation
    if (count === 1) {
        await simulateIncident(type);
    } else {
        await simulateMultipleIncidents(count, type, delay);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    simulateIncident,
    simulateMultipleIncidents,
    INCIDENT_TEMPLATES
};
