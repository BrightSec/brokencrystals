import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import type { Testimonial } from '../interfaces/Testimonial';
import type { LoginUser, RegistrationUser, UserData } from '../interfaces/User';
import { LoginFormMode } from '../interfaces/User';
import type { Product } from '../interfaces/Product';
import type { OidcClient } from '../interfaces/Auth';
import type { ChatMessage } from '../interfaces/ChatMessage';
import type {
  OrcaCatalog,
  OrcaChatReply,
  OrcaCredentialStatus
} from '../interfaces/OrcaRouter';
import { ApiUrl } from './ApiUrl';
import { makeApiRequest } from './makeApiRequest';
import type { HiddenUploadResponse } from '../interfaces/HiddenUploadResponse';

function formatDateToYYYYMMDD(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${dd}-${mm}-${yyyy}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export const httpClient: AxiosInstance = axios.create();

export function getTestimonials(): Promise<any> {
  return makeApiRequest({ url: ApiUrl.Testimonials, method: 'get' });
}

export function getTestimonialsCount(): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Testimonials}/count?query=${encodeURIComponent(
      'select count(1) as count from testimonial'
    )}`,
    method: 'get'
  });
}

export function getProducts(dateFrom: Date, dateTo: Date): Promise<Product[]> {
  return makeApiRequest({
    url: `${ApiUrl.Products}?date_from=${formatDateToYYYYMMDD(
      dateFrom
    )}&date_to=${formatDateToYYYYMMDD(dateTo)}`,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    }
  });
}

export function getLatestProducts(): Promise<Product[]> {
  return makeApiRequest({ url: ApiUrl.LatestProducts, method: 'get' });
}

export function postTestimonials(data: Testimonial): Promise<any> {
  return makeApiRequest({
    url: ApiUrl.Testimonials,
    method: 'post',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    },
    data
  });
}

export function postSubscriptions(email: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Subscriptions}?email=${email}`,
    method: 'post'
  });
}

export function postUser(data: RegistrationUser): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/${data.op}`,
    method: 'post',
    data
  });
}

export function getUser(
  user: LoginUser,
  config: AxiosRequestConfig = {}
): Promise<any> {
  const data = user.op === LoginFormMode.HTML ? mapToUrlParams(user) : user;
  return makeApiRequest({
    url: `${ApiUrl.Auth}/login`,
    method: 'post',
    data,
    ...config
  });
}

export function searchUsers(searchText: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/search/${searchText}`,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    }
  });
}

export function getUserData(
  email: string,
  config: AxiosRequestConfig = {}
): Promise<UserData> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email.trim()}`,
    method: 'get',
    ...config
  });
}

export function getUserDataById(id: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/id/${id}`,
    method: 'get'
  });
}

export function getLdap(ldapProfileLink: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/ldap?query=${encodeURIComponent(ldapProfileLink)}`,
    method: 'get'
  });
}

export function loadDomXsrfToken(fingerprint: string): Promise<string> {
  const config: AxiosRequestConfig = {
    url: `${ApiUrl.Auth}/dom-csrf-flow`,
    method: 'get',
    headers: { fingerprint }
  };

  return makeApiRequest(config);
}

export function loadXsrfToken(): Promise<string> {
  const config: AxiosRequestConfig = {
    url: `${ApiUrl.Auth}/simple-csrf-flow`,
    method: 'get'
  };

  return makeApiRequest(config);
}

export function getOidcClient(): Promise<OidcClient> {
  return makeApiRequest({
    url: `${ApiUrl.Auth}/oidc-client`,
    method: 'get'
  });
}

export function postMetadata(): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Metadata}`,
    method: 'post',
    headers: { 'content-type': 'text/xml' },
    data: '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE child [ <!ENTITY child SYSTEM "file:///etc/passwd"> ]><child></child>'
  });
}

export function getSpawnData(): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Spawn}?command=pwd`,
    method: 'get',
    headers: { 'content-type': 'text/plain' }
  });
}

export function getUserPhoto(
  email: string
): Promise<ArrayBuffer | { errorText: string }> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email}/photo`,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    },
    responseType: 'arraybuffer'
  });
}

export function postHiddenUpload(
  file: File,
  fileName?: string
): Promise<HiddenUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (fileName) {
    formData.append('fileName', fileName);
  }

  return makeApiRequest({
    url: ApiUrl.HiddenUpload,
    method: 'post',
    data: formData,
    headers: {
      'content-type': 'multipart/form-data'
    }
  });
}

export function removeUserPhotoById(
  id: string,
  isAdmin: boolean
): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${id}/photo?isAdmin=${isAdmin}`,
    method: 'delete',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    }
  });
}

export function getAdminStatus(email: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email}/adminpermission`,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    }
  });
}

export function putUserData(user: UserData): Promise<UserData> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${user.email}/info`,
    method: 'put',
    headers: {
      'content-type': 'application/json',
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    },
    data: user
  });
}

export function putPhoto(photo: File, email: string): Promise<any> {
  const data = new FormData();
  data.append(email, photo, photo.name);

  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email}/photo`,
    method: 'put',
    headers: {
      'content-type': 'image/png',
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    },
    data
  });
}

export function goTo(url: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Goto}?url=${url}`,
    method: 'get'
  });
}

export function postRender(data: string): Promise<any> {
  return makeApiRequest({
    url: ApiUrl.Render,
    method: 'post',
    headers: { 'content-type': 'text/plain' },
    data
  });
}

function mapToUrlParams<T>(data: T): URLSearchParams {
  return Object.entries(data as any).reduce((acc, [k, v]) => {
    acc.append(k, String(v));
    return acc;
  }, new URLSearchParams());
}

export function putFile(fileName: string, file: File): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.File}/raw?path=${fileName}`,
    method: 'put',
    headers: {
      'content-type': 'file/*'
    },
    data: file
  });
}

export function getFile(fileName: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.File}/raw?path=${fileName}`,
    method: 'get',
    headers: {
      'content-type': 'file/*'
    }
  });
}

export function viewProduct(productName: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Products}/views`,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token'),
      'x-product-name': productName
    }
  });
}

export function getNestedJson(jsonNestingLevel = 1): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.NestedJson}?depth=${jsonNestingLevel}`,
    method: 'get'
  });
}

export function queryPartnersRaw(xpath: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Partners}/query?xpath=${xpath}`,
    method: 'get'
  });
}

export function partnerLogin(username: string, password: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Partners}/partnerLogin?username=${username}&password=${password}`,
    method: 'get'
  });
}

export function searchPartners(keyword: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Partners}/searchPartners?keyword=${keyword}`,
    method: 'get'
  });
}

export function sendSupportEmailRequest(
  name: string,
  to: string,
  subject: string,
  content: string
): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Email}/sendSupportEmail?name=${name}&to=${to}&subject=${subject}&content=${content}`,
    method: 'get'
  });
}

export function queryChat(messages: ChatMessage[]): Promise<string> {
  return makeApiRequest({
    url: `${ApiUrl.Chat}/query`,
    method: 'post',
    data: messages
  }).then((res) => {
    return typeof res === 'string' ? res : '';
  });
}

/**
 * OrcaRouter endpoints return actionable JSON errors (401/429/400), so they use
 * axios directly instead of the generic helper that collapses every failure
 * into one message. Nothing secret is ever returned by these endpoints.
 */
async function orcaRequest<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await httpClient.request<T>(config);
    return response.data;
  } catch (error) {
    const candidate = error as {
      response?: { data?: { message?: unknown }; status?: number };
    };
    const serverMessage = candidate.response?.data?.message;
    const status = candidate.response?.status;
    throw new Error(
      typeof serverMessage === 'string' && serverMessage.length > 0
        ? serverMessage
        : `OrcaRouter request failed${status ? ` (HTTP ${status})` : ''}`
    );
  }
}

export function getOrcaModels(
  capability: string = 'chat'
): Promise<OrcaCatalog> {
  return orcaRequest<OrcaCatalog>({
    url: `${ApiUrl.OrcaRouter}/models?capability=${encodeURIComponent(
      capability
    )}`,
    method: 'get'
  });
}

export function getOrcaCredentials(): Promise<OrcaCredentialStatus> {
  return orcaRequest<OrcaCredentialStatus>({
    url: `${ApiUrl.OrcaRouter}/credentials`,
    method: 'get'
  });
}

export function saveOrcaCredential(
  apiKey: string
): Promise<OrcaCredentialStatus> {
  return orcaRequest<OrcaCredentialStatus>({
    url: `${ApiUrl.OrcaRouter}/credentials`,
    method: 'put',
    data: { apiKey }
  });
}

export function clearOrcaCredential(): Promise<OrcaCredentialStatus> {
  return orcaRequest<OrcaCredentialStatus>({
    url: `${ApiUrl.OrcaRouter}/credentials`,
    method: 'delete'
  });
}

export function queryOrcaChat(
  messages: ChatMessage[],
  model?: string
): Promise<OrcaChatReply> {
  return orcaRequest<OrcaChatReply>({
    url: `${ApiUrl.OrcaRouter}/chat`,
    method: 'post',
    data: model ? { messages, model } : { messages }
  });
}
