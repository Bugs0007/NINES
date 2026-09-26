/**
 * Component catalog with realistic AWS numbers (us-east-1, on-demand, Linux).
 * Prices change; every number has a source, and the Codex says when it was checked.
 */

export const HOURS_PER_MONTH = 730; // AWS's billing convention

export interface InstanceType {
  name: string;
  vcpu: number;
  memGiB: number;
  usdPerHour: number;
  family: "m7i" | "t3";
  note?: string;
}

export const INSTANCES: InstanceType[] = [
  { name: "t3.small", vcpu: 2, memGiB: 2, usdPerHour: 0.0208, family: "t3", note: "burstable: 20% baseline per vCPU, bursts on credits" },
  { name: "m7i.large", vcpu: 2, memGiB: 8, usdPerHour: 0.1008, family: "m7i" },
  { name: "m7i.xlarge", vcpu: 4, memGiB: 16, usdPerHour: 0.2016, family: "m7i" },
  { name: "m7i.2xlarge", vcpu: 8, memGiB: 32, usdPerHour: 0.4032, family: "m7i" },
  { name: "m7i.4xlarge", vcpu: 16, memGiB: 64, usdPerHour: 0.8064, family: "m7i" },
  { name: "m7i.8xlarge", vcpu: 32, memGiB: 128, usdPerHour: 1.6128, family: "m7i" },
];

export function instance(name: string): InstanceType {
  const i = INSTANCES.find((x) => x.name === name);
  if (!i) throw new Error(`unknown instance ${name}`);
  return i;
}

export const monthly = (usdPerHour: number) => usdPerHour * HOURS_PER_MONTH;

/** Application Load Balancer: fixed hourly + LCU-hours (we assume a small, steady LCU count). */
export const ALB = { usdPerHour: 0.0225, usdPerLcuHour: 0.008, assumedLcus: 2 };
export const albMonthly = () => (ALB.usdPerHour + ALB.usdPerLcuHour * ALB.assumedLcus) * HOURS_PER_MONTH;

/** ElastiCache for Redis OSS, on-demand. */
export const REDIS_NODES = [
  { name: "cache.t4g.micro", memGiB: 0.5, usdPerHour: 0.016 },
  { name: "cache.t4g.small", memGiB: 1.37, usdPerHour: 0.032 },
  { name: "cache.m7g.large", memGiB: 6.38, usdPerHour: 0.158 },
];

/** Typical Django/gunicorn sync worker resident memory for a mid-sized app (scenario input, not a law). */
export const DJANGO_WORKER_MB = 150;

export const CATALOG_SOURCES = [
  { id: "aws-ec2-pricing", title: "Amazon EC2 On-Demand Pricing", url: "https://aws.amazon.com/ec2/pricing/on-demand/" },
  { id: "aws-ec2-types", title: "Amazon EC2 instance types", url: "https://aws.amazon.com/ec2/instance-types/" },
  { id: "aws-t3", title: "Amazon EC2 T3 instances (baseline performance and CPU credits)", url: "https://aws.amazon.com/ec2/instance-types/t3/" },
  { id: "aws-elb-pricing", title: "Elastic Load Balancing pricing", url: "https://aws.amazon.com/elasticloadbalancing/pricing/" },
  { id: "aws-elasticache-pricing", title: "Amazon ElastiCache pricing", url: "https://aws.amazon.com/elasticache/pricing/" },
  { id: "aws-change-type", title: "Change the instance type (requires stopping an EBS-backed instance)", url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-resize.html" },
] as const;
