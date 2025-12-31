# CloudOps Autopilot - Troubleshooting Guide

## Common Issues and Solutions

### 1. Deployment Issues

#### Lambda Function Deployment Fails
**Symptoms:**
- `deploy.sh` script fails
- Terraform apply fails with Lambda errors

**Solutions:**
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify IAM permissions
aws iam get-user

# Check Python version (requires >= 3.11)
python3 --version

# Recreate deployment packages
cd functions
./deploy.sh
```

#### Terraform Initialization Fails
**Symptoms:**
- `terraform init` fails
- Provider download errors

**Solutions:**
```bash
# Clear Terraform cache
rm -rf .terraform .terraform.lock.hcl

# Reinitialize
terraform init

# If behind corporate firewall
export HTTPS_PROXY=your-proxy-url
terraform init
```

### 2. Runtime Issues

#### No Incidents Appearing in Dashboard
**Symptoms:**
- Dashboard shows zero incidents
- Events are being generated but not processed

**Debugging Steps:**
```bash
# Check Lambda function logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/cloudops-autopilot"

# View recent logs
aws logs tail /aws/lambda/cloudops-autopilot-incident-detector --follow

# Check EventBridge rules
aws events list-rules --event-bus-name cloudops-autopilot-events

# Verify DynamoDB table
aws dynamodb scan --table-name cloudops-autopilot-incidents --max-items 5
```

**Common Causes:**
1. **EventBridge rules not active**
   ```bash
   aws events enable-rule --name cloudops-autopilot-ec2-events
   ```

2. **Lambda function permissions**
   - Check IAM role has DynamoDB write permissions
   - Verify EventBridge can invoke Lambda

3. **Wrong event bus name**
   - Check environment variables in Lambda function
   - Verify EventBridge rule targets correct function

#### Dashboard API Not Working
**Symptoms:**
- Dashboard shows "Loading..." indefinitely
- API Gateway returns 500 errors

**Debugging Steps:**
```bash
# Test API Gateway directly
curl https://your-api-gateway-url.amazonaws.com/prod/incidents

# Check Lambda function logs
aws logs tail /aws/lambda/cloudops-autopilot-dashboard-api --follow

# Verify CORS configuration
aws apigateway get-method --rest-api-id YOUR_API_ID --resource-id YOUR_RESOURCE_ID --http-method GET
```

**Solutions:**
1. **Update API URL in dashboard**
   ```javascript
   // In dashboard/script.js
   const API_BASE_URL = 'https://your-actual-api-gateway-url.amazonaws.com/prod';
   ```

2. **CORS issues**
   - Verify API Gateway has CORS enabled
   - Check browser developer console for CORS errors

### 3. Notification Issues

#### Not Receiving Email Notifications
**Symptoms:**
- Incidents are created but no emails sent
- SNS topic exists but no messages

**Debugging Steps:**
```bash
# Check SNS topic subscriptions
aws sns list-subscriptions-by-topic --topic-arn YOUR_TOPIC_ARN

# Check SNS topic permissions
aws sns get-topic-attributes --topic-arn YOUR_TOPIC_ARN

# Test SNS directly
aws sns publish --topic-arn YOUR_TOPIC_ARN --message "Test message"
```

**Solutions:**
1. **Confirm email subscription**
   - Check email inbox for confirmation message
   - Click confirmation link

2. **Check spam folder**
   - AWS notifications may be filtered as spam

3. **Verify SNS permissions**
   - Lambda function needs `sns:Publish` permission

### 4. Performance Issues

#### High Lambda Costs
**Symptoms:**
- Unexpected Lambda charges
- Functions running longer than expected

**Investigation:**
```bash
# Check Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=cloudops-autopilot-incident-detector \
  --start-time 2023-12-30T00:00:00Z \
  --end-time 2023-12-31T00:00:00Z \
  --period 3600 \
  --statistics Average,Maximum
```

**Solutions:**
1. **Optimize function memory**
   - Monitor memory usage in CloudWatch
   - Adjust memory allocation in Terraform

2. **Reduce function timeout**
   - Current timeout is 30 seconds
   - Most functions should complete in < 5 seconds

#### DynamoDB Throttling
**Symptoms:**
- Lambda functions timing out
- DynamoDB throttling errors in logs

**Solutions:**
```bash
# Check DynamoDB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ThrottledRequests \
  --dimensions Name=TableName,Value=cloudops-autopilot-incidents \
  --start-time 2023-12-30T00:00:00Z \
  --end-time 2023-12-31T00:00:00Z \
  --period 3600 \
  --statistics Sum
```

1. **Switch to provisioned capacity**
   - Modify Terraform configuration
   - Set appropriate read/write capacity

2. **Implement exponential backoff**
   - Already implemented in Lambda functions
   - Check retry logic in code

### 5. Security Issues

#### S3 Bucket Access Denied
**Symptoms:**
- Dashboard not loading
- 403 errors when accessing S3

**Solutions:**
```bash
# Check bucket policy
aws s3api get-bucket-policy --bucket YOUR_BUCKET_NAME

# Verify public access settings
aws s3api get-public-access-block --bucket YOUR_BUCKET_NAME
```

1. **Update bucket policy**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
       }
     ]
   }
   ```

#### IAM Permission Errors
**Symptoms:**
- Lambda functions failing with permission errors
- API Gateway returning 403 errors

**Debugging:**
```bash
# Check Lambda function role
aws lambda get-function --function-name cloudops-autopilot-incident-detector

# Verify role permissions
aws iam list-attached-role-policies --role-name cloudops-autopilot-lambda-role
```

### 6. Monitoring and Debugging

#### Enable Debug Logging
Add to Lambda function environment variables:
```bash
LOG_LEVEL=DEBUG
```

#### CloudWatch Insights Queries
```sql
-- Find Lambda errors
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 20

-- Monitor incident processing
fields @timestamp, @message
| filter @message like /Incident.*created/
| sort @timestamp desc
| limit 50
```

#### Custom Metrics
Monitor key metrics:
- Incident detection rate
- Processing latency
- Error rates
- API response times

### 7. Recovery Procedures

#### Complete System Reset
```bash
# 1. Clean up existing resources
cd scripts
./cleanup.sh

# 2. Redeploy from scratch
cd ../functions
./deploy.sh

cd ../infrastructure
terraform init
terraform apply

# 3. Redeploy dashboard
cd ../dashboard
aws s3 sync . s3://YOUR_BUCKET_NAME --delete
```

#### Data Recovery
```bash
# Export DynamoDB data before cleanup
aws dynamodb scan --table-name cloudops-autopilot-incidents > incidents-backup.json

# Restore data after redeployment
aws dynamodb batch-write-item --request-items file://incidents-restore.json
```

### 8. Getting Help

#### AWS Support Resources
- AWS Documentation: https://docs.aws.amazon.com/
- AWS Forums: https://forums.aws.amazon.com/
- AWS Support: https://aws.amazon.com/support/

#### CloudOps Autopilot Support
- GitHub Issues: [Create issue with logs and error details]
- Documentation: Check README.md and docs/ folder
- Community: [Discord/Slack channel if available]

#### Useful AWS CLI Commands
```bash
# Check service limits
aws service-quotas list-service-quotas --service-code lambda

# Monitor costs
aws ce get-cost-and-usage --time-period Start=2023-12-01,End=2023-12-31 --granularity MONTHLY --metrics BlendedCost

# Check CloudTrail for API calls
aws logs filter-log-events --log-group-name CloudTrail/CloudWatchLogGroup --filter-pattern "{ $.eventName = \"PutEvents\" }"
```
