import { Module } from '@nestjs/common';
import { HttpClientModule } from '../httpclient/httpclient.module';
import { OrcaRouterCatalogService } from './orcarouter-catalog.service';
import { OrcaRouterCredentialStore } from './orcarouter.credential.store';
import { OrcaRouterController } from './orcarouter.controller';
import { OrcaRouterService } from './orcarouter.service';

/**
 * First-class OrcaRouter Cyber Inference provider: own base URL, own
 * credential seam, own model catalog and its own API surface.
 */
@Module({
  imports: [HttpClientModule],
  controllers: [OrcaRouterController],
  providers: [
    OrcaRouterCredentialStore,
    OrcaRouterCatalogService,
    OrcaRouterService
  ],
  exports: [
    OrcaRouterCredentialStore,
    OrcaRouterCatalogService,
    OrcaRouterService
  ]
})
export class OrcaRouterModule {}
