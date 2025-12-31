terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# DynamoDB Table for Incidents
resource "aws_dynamodb_table" "incidents" {
  name         = "cloudops-incidents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "incident_id"
  range_key    = "timestamp"

  attribute {
    name = "incident_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "incident_type"
    type = "S"
  }

  global_secondary_index {
    name            = "incident_type_index"
    hash_key        = "incident_type"
    projection_type = "ALL"
  }

  tags = {
    Project = "CloudOpsAutopilot"
  }
}


# S3 Bucket for Dashboard
resource "aws_s3_bucket" "dashboard" {
  bucket = "${var.project_name}-dashboard-${random_string.bucket_suffix.result}"
  tags   = var.tags
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket_website_configuration" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  
  index_document {
    suffix = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.dashboard.arn}/*"
      }
    ]
  })
}

# SNS Topic for Notifications
resource "aws_sns_topic" "incidents" {
  name = "${var.project_name}-incidents"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.incidents.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# EventBridge Custom Bus
resource "aws_cloudwatch_event_bus" "main" {
  name = "${var.project_name}-events"
  tags = var.tags
}

# IAM Role for Lambda Functions
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
  
  tags = var.tags
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-lambda-policy"
  role = aws_iam_role.lambda_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.incidents.arn,
          "${aws_dynamodb_table.incidents.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.incidents.arn
      },
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents"
        ]
        Resource = aws_cloudwatch_event_bus.main.arn
      }
    ]
  })
}

# Lambda Function for Incident Detection
resource "aws_lambda_function" "incident_detector" {
  filename         = "incident-detector.zip"
  function_name    = "${var.project_name}-incident-detector"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda_function.lambda_handler"
  runtime         = "python3.11"
  timeout         = 30
  
  environment {
    variables = {
      INCIDENTS_TABLE = aws_dynamodb_table.incidents.name
      SNS_TOPIC_ARN   = aws_sns_topic.incidents.arn
      EVENT_BUS_NAME  = aws_cloudwatch_event_bus.main.name
    }
  }
  
  tags = var.tags
}

# Lambda Function for Dashboard API
resource "aws_lambda_function" "dashboard_api" {
  filename         = "dashboard-api.zip"
  function_name    = "${var.project_name}-dashboard-api"
  role            = aws_iam_role.lambda_role.arn
  handler         = "lambda_function.lambda_handler"
  runtime         = "python3.11"
  timeout         = 10
  
  environment {
    variables = {
      INCIDENTS_TABLE = aws_dynamodb_table.incidents.name
    }
  }
  
  tags = var.tags
}

# API Gateway for Dashboard API
resource "aws_api_gateway_rest_api" "dashboard_api" {
  name = "${var.project_name}-api"
  
  endpoint_configuration {
    types = ["REGIONAL"]
  }
  
  tags = var.tags
}

resource "aws_api_gateway_resource" "incidents" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  parent_id   = aws_api_gateway_rest_api.dashboard_api.root_resource_id
  path_part   = "incidents"
}

resource "aws_api_gateway_resource" "metrics" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  parent_id   = aws_api_gateway_rest_api.dashboard_api.root_resource_id
  path_part   = "metrics"
}

resource "aws_api_gateway_method" "get_incidents" {
  rest_api_id   = aws_api_gateway_rest_api.dashboard_api.id
  resource_id   = aws_api_gateway_resource.incidents.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "get_metrics" {
  rest_api_id   = aws_api_gateway_rest_api.dashboard_api.id
  resource_id   = aws_api_gateway_resource.metrics.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "options_incidents" {
  rest_api_id   = aws_api_gateway_rest_api.dashboard_api.id
  resource_id   = aws_api_gateway_resource.incidents.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_method" "options_metrics" {
  rest_api_id   = aws_api_gateway_rest_api.dashboard_api.id
  resource_id   = aws_api_gateway_resource.metrics.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda_integration_incidents" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  resource_id = aws_api_gateway_resource.incidents.id
  http_method = aws_api_gateway_method.get_incidents.http_method
  
  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.dashboard_api.invoke_arn
}

resource "aws_api_gateway_integration" "lambda_integration_metrics" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  resource_id = aws_api_gateway_resource.metrics.id
  http_method = aws_api_gateway_method.get_metrics.http_method
  
  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.dashboard_api.invoke_arn
}

resource "aws_api_gateway_integration" "options_integration_incidents" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  resource_id = aws_api_gateway_resource.incidents.id
  http_method = aws_api_gateway_method.options_incidents.http_method
  type        = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_integration" "options_integration_metrics" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  resource_id = aws_api_gateway_resource.metrics.id
  http_method = aws_api_gateway_method.options_metrics.http_method
  type        = "MOCK"
  
  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "options_response_incidents" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  resource_id = aws_api_gateway_resource.incidents.id
  http_method = aws_api_gateway_method.options_incidents.http_method
  status_code = "200"
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_method_response" "options_response_metrics" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  resource_id = aws_api_gateway_resource.metrics.id
  http_method = aws_api_gateway_method.options_metrics.http_method
  status_code = "200"
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "options_integration_response_incidents" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  resource_id = aws_api_gateway_resource.incidents.id
  http_method = aws_api_gateway_method.options_incidents.http_method
  status_code = aws_api_gateway_method_response.options_response_incidents.status_code
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_integration_response" "options_integration_response_metrics" {
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  resource_id = aws_api_gateway_resource.metrics.id
  http_method = aws_api_gateway_method.options_metrics.http_method
  status_code = aws_api_gateway_method_response.options_response_metrics.status_code
  
  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_deployment" "dashboard_api" {
  depends_on = [
    aws_api_gateway_integration.lambda_integration_incidents,
    aws_api_gateway_integration.lambda_integration_metrics,
    aws_api_gateway_integration.options_integration_incidents,
    aws_api_gateway_integration.options_integration_metrics
  ]
  
  rest_api_id = aws_api_gateway_rest_api.dashboard_api.id
  stage_name  = "prod"
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.dashboard_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.dashboard_api.execution_arn}/*/*"
}

# EventBridge Rules for AWS Service Events
resource "aws_cloudwatch_event_rule" "ec2_events" {
  name           = "${var.project_name}-ec2-events"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  
  event_pattern = jsonencode({
    source      = ["aws.ec2"]
    detail-type = ["EC2 Instance State-change Notification"]
  })
  
  tags = var.tags
}

resource "aws_cloudwatch_event_rule" "rds_events" {
  name           = "${var.project_name}-rds-events"
  event_bus_name = aws_cloudwatch_event_bus.main.name
  
  event_pattern = jsonencode({
    source      = ["aws.rds"]
    detail-type = ["RDS DB Instance Event", "RDS DB Cluster Event"]
  })
  
  tags = var.tags
}

resource "aws_cloudwatch_event_target" "ec2_lambda" {
  rule           = aws_cloudwatch_event_rule.ec2_events.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "IncidentDetectorTargetEC2"
  arn            = aws_lambda_function.incident_detector.arn
}

resource "aws_cloudwatch_event_target" "rds_lambda" {
  rule           = aws_cloudwatch_event_rule.rds_events.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "IncidentDetectorTargetRDS"
  arn            = aws_lambda_function.incident_detector.arn
}

resource "aws_lambda_permission" "eventbridge_ec2" {
  statement_id  = "AllowExecutionFromEventBridgeEC2"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.incident_detector.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ec2_events.arn
}

resource "aws_lambda_permission" "eventbridge_rds" {
  statement_id  = "AllowExecutionFromEventBridgeRDS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.incident_detector.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.rds_events.arn
}
