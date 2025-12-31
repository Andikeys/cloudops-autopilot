# CloudOps Autopilot Architecture

## System Overview
CloudOps Autopilot is a serverless incident detection and response system that monitors AWS services in real-time and provides AI-powered insights for rapid issue resolution.

## Architecture Diagram Description
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   AWS Services  │───▶│   EventBridge    │───▶│ Lambda Detector │
│ (EC2, RDS, etc) │    │  (Event Router)  │    │  (Event Proc.)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CloudWatch    │───▶│   SNS Topics     │◀───│    DynamoDB     │
│   (Alarms)      │    │ (Notifications)  │    │ (Incident Store)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Email/SMS Users │    │   Dashboard API  │◀───│   S3 Bucket     │
│                 │    │    (Lambda)      │    │ (Static Site)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Component Details

### 1. Event Collection Layer
- **EventBridge**: Receives events from 15+ AWS services
- **CloudWatch**: Monitors metrics and triggers alarms
- **Event Sources**: EC2, RDS, Lambda, S3, ELB, etc.

### 2. Processing Layer
- **Incident Detector Lambda**: Processes events and detects patterns
- **AI Analyzer**: Generates root cause analysis using AWS Bedrock
- **Event Correlation**: Links related incidents

### 3. Storage Layer
- **DynamoDB**: Stores incidents, metrics, and system state
- **S3**: Hosts dashboard and stores logs
- **Tables**: incidents, metrics, configurations

### 4. Notification Layer
- **SNS**: Multi-channel alert delivery
- **Email/SMS**: Immediate incident notifications
- **Dashboard**: Real-time web interface

### 5. Presentation Layer
- **Static Dashboard**: React-based SPA hosted on S3
- **API Gateway**: RESTful API for dashboard data
- **Real-time Updates**: WebSocket connections for live data

## Data Flow

1. **Event Ingestion**: AWS services send events to EventBridge
2. **Event Processing**: Lambda detector analyzes and categorizes events
3. **Incident Creation**: Significant events become incidents in DynamoDB
4. **AI Analysis**: Bedrock generates insights and remediation steps
5. **Notification**: SNS sends alerts to configured channels
6. **Dashboard Update**: Real-time display of incidents and metrics

## Scalability Design

- **Serverless**: Auto-scales based on event volume
- **Event-Driven**: Loose coupling between components
- **Stateless**: Functions can scale independently
- **Caching**: DynamoDB DAX for sub-millisecond reads

## Security Features

- **IAM Roles**: Least privilege access for all components
- **VPC**: Optional network isolation
- **Encryption**: At-rest and in-transit data protection
- **API Keys**: Secure dashboard API access

## Cost Optimization

- **Free Tier Aligned**: Designed to stay within AWS limits
- **On-Demand**: Pay only for actual usage
- **Efficient Storage**: DynamoDB on-demand pricing
- **Smart Alerting**: Reduces noise and false positives
