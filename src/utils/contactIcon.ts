import {
  Mail,
  Phone,
  Linkedin,
  Github,
  Globe,
  MapPin,
  Twitter,
  Link as LinkIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ContactFieldType } from '@/types';

export function iconForContactType(type: ContactFieldType): LucideIcon {
  switch (type) {
    case 'email':
      return Mail;
    case 'phone':
      return Phone;
    case 'linkedin':
      return Linkedin;
    case 'github':
      return Github;
    case 'website':
      return Globe;
    case 'location':
      return MapPin;
    case 'twitter':
      return Twitter;
    case 'custom':
      return LinkIcon;
  }
}

export function placeholderForContactType(type: ContactFieldType): string {
  switch (type) {
    case 'email':
      return 'your.name@email.com';
    case 'phone':
      return '(555) 123-4567';
    case 'linkedin':
      return 'linkedin.com/in/yourname';
    case 'github':
      return 'github.com/yourname';
    case 'website':
      return 'yourname.com';
    case 'location':
      return 'City, ST';
    case 'twitter':
      return '@yourname';
    case 'custom':
      return 'Custom field';
  }
}

export function defaultLabelForContactType(type: ContactFieldType): string {
  switch (type) {
    case 'email':
      return 'Email';
    case 'phone':
      return 'Phone';
    case 'linkedin':
      return 'LinkedIn';
    case 'github':
      return 'GitHub';
    case 'website':
      return 'Website';
    case 'location':
      return 'Location';
    case 'twitter':
      return 'Twitter';
    case 'custom':
      return 'Custom';
  }
}
