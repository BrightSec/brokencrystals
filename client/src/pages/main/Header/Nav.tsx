import { useEffect, useState } from 'react';
import { getAdminStatus } from '../../../api/httpClient';
import { RoutePath } from '../../../router/RoutePath';
interface MenuItem {
  name: string;
  path: string;
  newTab: boolean;
  subItems?: Array<MenuItem>;
  admin?: boolean;
}

const menu: Array<MenuItem> = [
  { name: 'Home', path: '/?maptitle=map', newTab: false },
  {
    name: 'Marketplace',
    path: '/marketplace?portfolio_query_filter=&videosrc=https://www.youtube-nocookie.com/embed/MPYlxeG-8_w?controls=0',
    newTab: false
  },
  {
    name: 'Chat',
    path: '/chat',
    newTab: false
  },
  { name: 'Edit user data', path: RoutePath.Userprofile, newTab: false },
  {
    name: 'Adminmenu',
    path: '',
    newTab: false,
    admin: true,
    subItems: [
      { name: 'Adminpage', path: RoutePath.Adminpage, newTab: false },
      { name: 'Dashboard', path: RoutePath.Dashboard, newTab: false }
    ]
  },
  {
    name: 'API Schema',
    path: '',
    newTab: false,
    subItems: [
      {
        name: 'OpenAPI 3.0 JSON',
        path: '/swagger-json',
        newTab: true
      },
      {
        name: 'API Reference',
        path: '/swagger',
        newTab: true
      },
      {
        name: 'GraphiQL',
        path: '/graphiql',
        newTab: true
      }
    ]
  },
  {
    name: 'Vulnerabilities',
    path: 'https://github.com/BrightSec/brokencrystals#vulnerabilities-overview',
    newTab: true
  }
];

export const Nav = () => {
  const user = sessionStorage.getItem('email') || localStorage.getItem('email');
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  useEffect(() => {
    checkIsAdmin();
  }, [isAdminUser]);

  const checkIsAdmin = () => {
    if (user) {
      getAdminStatus(user).then((data) => {
        setIsAdminUser(data.isAdmin);
      });
    }
  };

  const menuItem = (item: MenuItem) => {
    return (
      <li
        className={`${item.subItems && 'drop-down'} ${
          window.location.pathname == item.path && 'active'
        }`}
        key={`${item.name}-${item.path}`}
      >
        <a href={item.path} target={item.newTab ? '_blank' : undefined}>
          {item.name}
        </a>
        {item.subItems && (
          <ul>
            {item.subItems.map((subItem) => (
              <li key={`${subItem.name}-${subItem.path}`}>
                <a
                  href={subItem.path}
                  target={subItem.newTab ? '_blank' : undefined}
                >
                  {subItem.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav className="nav-menu d-none d-lg-block">
      <ul>
        {menu.map((item) =>
          !item.admin || isAdminUser ? menuItem(item) : undefined
        )}
      </ul>
    </nav>
  );
};
export default Nav;
