from setuptools import setup, find_packages
from setuptools.command.build_ext import build_ext
from codecs import open
from os import path

here = path.abspath(path.dirname(__file__))

with open(path.join(here, 'README'), encoding='utf-8') as f:
    long_description = f.read()


setup(
    name='potracecffi',
    version='2022.8.22.post1',
    description="Minimal bindings to potracelib using cffi",
    long_description=long_description,
    url='https://github.com/wntrblm/potracecffi',
    author='Alethea Katherine Flowers',
    author_email='thea@winterbloom.com',
    classifiers=[
        'Intended Audience :: Developers',
        'Topic :: Software Development :: Build Tools',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.10',
    ],
    packages=find_packages(),
    cffi_modules=["potracecffi/potracecffi_build.py:ffibuilder"],
    setup_requires=["cffi>=1.15.0"],
    install_requires=["cffi>=1.15.0"],
    project_urls={
        'Source': 'https://github.com/wntrblm/potracecffi',
    },
    zip_safe=False,
    include_package_data=True,
)
