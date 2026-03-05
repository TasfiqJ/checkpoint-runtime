output "region" {
  description = "AWS region used"
  value       = var.region
}

output "s3_bucket_name" {
  description = "Checkpoint storage S3 bucket name"
  value       = aws_s3_bucket.checkpoints.id
}

output "s3_bucket_arn" {
  description = "Checkpoint storage S3 bucket ARN"
  value       = aws_s3_bucket.checkpoints.arn
}

output "ecr_control_plane_url" {
  description = "ECR repository URL for the control plane image"
  value       = aws_ecr_repository.control_plane.repository_url
}

output "ecr_data_plane_url" {
  description = "ECR repository URL for the data plane image"
  value       = aws_ecr_repository.data_plane.repository_url
}

output "ecr_frontend_url" {
  description = "ECR repository URL for the frontend image"
  value       = aws_ecr_repository.frontend.repository_url
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

output "ecs_cluster_name" {
  description = "ECS Fargate cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ECS Fargate cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  value       = aws_security_group.ecs_tasks.id
}

output "ecs_execution_role_arn" {
  description = "IAM execution role ARN for ECS tasks"
  value       = aws_iam_role.ecs_execution.arn
}

output "ecs_task_role_arn" {
  description = "IAM task role ARN (includes S3 access)"
  value       = aws_iam_role.ecs_task.arn
}
