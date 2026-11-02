import {
  CfnOutput,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  RemovalPolicy,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
} from "aws-cdk-lib";
import { Construct } from "constructs";

export interface StaticSiteProps {
  /** Directory with the built site (e.g. apps/web-react/dist). */
  distDir: string;
  /** SPA mode: serve index.html for unknown paths. Defaults to true. */
  spa?: boolean;
}

/** Private S3 bucket served through CloudFront (origin access control). */
export class StaticSite extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StaticSiteProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, "Bucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const spa = props.spa ?? true;
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: spa
        ? [403, 404].map((httpStatus) => ({
            httpStatus,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          }))
        : undefined,
    });

    new s3deploy.BucketDeployment(this, "Deploy", {
      sources: [s3deploy.Source.asset(props.distDir)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
    });

    new CfnOutput(this, "Url", {
      value: `https://${this.distribution.distributionDomainName}`,
    });
  }
}
