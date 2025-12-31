# CloudOps Autopilot - Deployment Guide

## Prerequisites

Before deploying CloudOps Autopilot, ensure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Terraform** >= 1.0 installed
4. **Python** >= 3.11 for Lambda functions

## Step-by-Step Deployment

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd cloudops-autopilot
```

### 2. Configure Variables

```bash
cd infrastructure
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your settings:
```hcl
aws_region         = "us-east-1"
project_name       = "cloudops-autopilot"
notification_email = "your-email@example.com"
```

### 3. Deploy Lambda Functions

```bash
cd ../functions
./deploy.sh
```

This script will:
- Create deployment packages for Python Lambda functions
- Move packages to infrastructure directory

### 4. Deploy Infrastructure

```bash
cd ../infrastructure
terraform init
terraform plan
terraform apply
```

Review the plan and type `yes` to confirm deployment.

### 5. Deploy Dashboard

After infrastructure deployment, get the API Gateway URL:

```bash
terraform output api_gateway_url
```

Update the dashboard configuration:
```bash
cd ../dashboard
# Edit script.js and update API_BASE_URL with your API Gateway URL
```

Upload dashboard files to S3:
```bash
aws s3 sync . s3://$(terraform output -raw s3_bucket_name) --delete
```

### 6. Configure SNS Notifications

If you provided an email address, check your inbox and confirm the SNS subscription.

## Post-Deployment Configuration

### 1. Get Dashboard URL

```bash
terraform output dashboard_url
```

### 2. Test the System

```bash
cd ../scripts
node simulate-incidents.js
```

### 3. Verify Notifications

Check that you receive email notifications for critical incidents.

## Monitoring and Maintenance

### CloudWatch Logs

Monitor Lambda function logs:
- `/aws/lambda/cloudops-autopilot-incident-detector`
- `/aws/lambda/cloudops-autopilot-dashboard-api`

### DynamoDB

Check incident storage in the DynamoDB table:
```bash
aws dynamodb scan --table-name cloudops-autopilot-incidents
```

### Cost Monitoring

The system is designed for AWS Free Tier:
- Lambda: 1M requests/month free
- DynamoDB: 25GB storage free
- S3: 5GB storage free
- SNS: 1,000 notifications free

## Troubleshooting

### Common Issues

1. **Lambda deployment fails**
   - Check AWS credentials: `aws sts get-caller-identity`
   - Verify IAM permissions for Lambda, DynamoDB, SNS

2. **Dashboard not loading**
   - Check S3 bucket policy allows public read
   - Verify API Gateway URL in script.js

3. **No incidents appearing**
   - Check EventBridge rules are active
   - Verify Lambda function permissions
   - Review CloudWatch logs

### Cleanup

To remove all resources:
```bash
cd scripts
./cleanup.sh
```

## Security Considerations

1. **IAM Roles**: Functions use least-privilege access
2. **API Gateway**: Consider adding API keys for production
3. **S3 Bucket**: Dashboard bucket allows public read (required for static hosting)
4. **VPC**: Consider deploying Lambda functions in VPC for additional security

## Scaling for Production

1. **DynamoDB**: Switch to provisioned capacity for predictable workloads
2. **Lambda**: Configure reserved concurrency for critical functions
3. **CloudWatch**: Set up custom metrics and alarms
4. **Multi-Region**: Deploy in multiple regions for high availability
